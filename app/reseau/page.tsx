'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Network,
  Ruler,
  Layers,
  CalendarClock,
  AlertTriangle,
  Droplets,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { num } from '@/lib/format';
import { useDataRefresh } from '@/lib/use-data-version';

/* =====================================================================
 * Réseau & Fuites — Conakry
 * Source : /api/reseau (seg_reseau_conduites + bilan produit/distribué).
 * Rechargement automatique quand les données changent en base.
 * ===================================================================== */

type Conduite = {
  id: number;
  zone_commerciale: string;
  agency_id: number | null;
  zone_hydraulique: string;
  ligne_no: number;
  diametre_mm: number;
  nature: string;
  nature_source: string;
  longueur_ml: number;
  annee_pose: number | null;
};

type Bilan = { exercice: number; mois: number; produit: number; distribue: number };

type ReseauResponse = {
  ok: boolean;
  error?: string;
  data?: { conduites: Conduite[]; bilan: Bilan[]; lastRefresh: string | null };
};

const MATERIALS = ['PVC', 'FONTE', 'ACIER'] as const;
type Material = (typeof MATERIALS)[number];

// Couleurs validées (daltonisme, contraste) sur fond sombre et clair.
const MATERIAL_COLOR: Record<Material, string> = {
  PVC: '#0284c7',
  FONTE: '#d97706',
  ACIER: '#7c3aed',
};
const MATERIAL_LABEL: Record<Material, string> = { PVC: 'PVC', FONTE: 'Fonte', ACIER: 'Acier' };

const DN_CLASSES = [
  { key: 'xs', label: 'DN ≤ 90', min: 0, max: 90 },
  { key: 's', label: 'DN 100 – 160', min: 91, max: 160 },
  { key: 'm', label: 'DN 200 – 300', min: 161, max: 300 },
  { key: 'l', label: 'DN 400 – 600', min: 301, max: 600 },
  { key: 'xl', label: 'DN ≥ 700', min: 601, max: 100000 },
] as const;

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const CURRENT_YEAR = new Date().getFullYear();
const OLD_THRESHOLD = 50; // ans

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  fontSize: 11,
  color: 'var(--text-secondary)',
};

function km(ml: number): string {
  return `${(ml / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

function pct1(value: number): string {
  return `${(value * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function asMaterial(value: string): Material {
  return (MATERIALS as readonly string[]).includes(value) ? (value as Material) : 'PVC';
}

type Agg = {
  total: number;
  byMaterial: Record<Material, number>;
  weightedYear: number;
  datedLength: number;
  oldLength: number;
  maxDn: number;
  count: number;
};

function aggregate(rows: Conduite[]): Agg {
  const agg: Agg = {
    total: 0,
    byMaterial: { PVC: 0, FONTE: 0, ACIER: 0 },
    weightedYear: 0,
    datedLength: 0,
    oldLength: 0,
    maxDn: 0,
    count: rows.length,
  };
  for (const r of rows) {
    agg.total += r.longueur_ml;
    agg.byMaterial[asMaterial(r.nature)] += r.longueur_ml;
    agg.maxDn = Math.max(agg.maxDn, r.diametre_mm);
    if (r.annee_pose) {
      agg.weightedYear += r.annee_pose * r.longueur_ml;
      agg.datedLength += r.longueur_ml;
      if (CURRENT_YEAR - r.annee_pose > OLD_THRESHOLD) agg.oldLength += r.longueur_ml;
    }
  }
  return agg;
}

function avgYear(a: Agg): number | null {
  return a.datedLength > 0 ? Math.round(a.weightedYear / a.datedLength) : null;
}

export default function ReseauPage() {
  const refreshTick = useDataRefresh();
  const [reloadToken, setReloadToken] = useState(0);
  const [conduites, setConduites] = useState<Conduite[]>([]);
  const [bilan, setBilan] = useState<Bilan[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [zone, setZone] = useState('');
  const [material, setMaterial] = useState('');
  const [dnClass, setDnClass] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/reseau', { cache: 'no-store', signal: controller.signal });
        const result = (await response.json()) as ReseauResponse;
        if (!response.ok || !result.ok || !result.data) {
          throw new Error(
            response.status === 403
              ? 'Permission « network.view » requise.'
              : result.error || `Erreur HTTP ${response.status}`
          );
        }
        setConduites(result.data.conduites);
        setBilan(result.data.bilan);
        setLastRefresh(result.data.lastRefresh);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Chargement impossible.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [refreshTick, reloadToken]);

  const zones = useMemo(
    () => Array.from(new Set(conduites.map((c) => c.zone_commerciale))).sort((a, b) => a.localeCompare(b, 'fr')),
    [conduites]
  );

  const filtered = useMemo(() => {
    const cls = DN_CLASSES.find((c) => c.key === dnClass);
    const term = search.trim().toLowerCase();
    return conduites.filter(
      (c) =>
        (!zone || c.zone_commerciale === zone) &&
        (!material || c.nature === material) &&
        (!cls || (c.diametre_mm >= cls.min && c.diametre_mm <= cls.max)) &&
        (!term || c.zone_hydraulique.toLowerCase().includes(term))
    );
  }, [conduites, zone, material, dnClass, search]);

  const agg = useMemo(() => aggregate(filtered), [filtered]);
  const hydraulicZones = useMemo(() => new Set(filtered.map((c) => c.zone_hydraulique)).size, [filtered]);
  const meanYear = avgYear(agg);

  // Linéaire par zone commerciale, empilé par matériau (km).
  const byZone = useMemo(() => {
    return zones
      .map((z) => {
        const a = aggregate(filtered.filter((c) => c.zone_commerciale === z));
        return {
          zone: z,
          PVC: +(a.byMaterial.PVC / 1000).toFixed(2),
          FONTE: +(a.byMaterial.FONTE / 1000).toFixed(2),
          ACIER: +(a.byMaterial.ACIER / 1000).toFixed(2),
          total: a.total,
        };
      })
      .filter((z) => z.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [zones, filtered]);

  // Profil d'âge : linéaire par décennie de pose (km), empilé par matériau.
  const byDecade = useMemo(() => {
    const map = new Map<number, Record<Material, number>>();
    for (const c of filtered) {
      if (!c.annee_pose) continue;
      const decade = Math.floor(c.annee_pose / 10) * 10;
      const current = map.get(decade) ?? { PVC: 0, FONTE: 0, ACIER: 0 };
      current[asMaterial(c.nature)] += c.longueur_ml;
      map.set(decade, current);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([decade, m]) => ({
        label: `${decade}`,
        PVC: +(m.PVC / 1000).toFixed(2),
        FONTE: +(m.FONTE / 1000).toFixed(2),
        ACIER: +(m.ACIER / 1000).toFixed(2),
      }));
  }, [filtered]);

  // Répartition par classe de diamètre.
  const byDn = useMemo(() => {
    return DN_CLASSES.map((cls) => {
      const rows = filtered.filter((c) => c.diametre_mm >= cls.min && c.diametre_mm <= cls.max);
      return { ...cls, length: rows.reduce((acc, r) => acc + r.longueur_ml, 0), count: rows.length };
    });
  }, [filtered]);
  const maxDnLength = byDn.reduce((acc, d) => Math.max(acc, d.length), 0);

  // Tableau des zones hydrauliques.
  const hydraulicTable = useMemo(() => {
    const map = new Map<string, Conduite[]>();
    for (const c of filtered) {
      const list = map.get(c.zone_hydraulique) ?? [];
      list.push(c);
      map.set(c.zone_hydraulique, list);
    }
    return Array.from(map.entries())
      .map(([zh, rows]) => {
        const a = aggregate(rows);
        const dominant = MATERIALS.reduce((best, m) => (a.byMaterial[m] > a.byMaterial[best] ? m : best), 'PVC' as Material);
        return { zh, zone: rows[0].zone_commerciale, rows, agg: a, dominant };
      })
      .sort(
        (a, b) =>
          a.zone.localeCompare(b.zone, 'fr') ||
          a.zh.localeCompare(b.zh, 'fr', { numeric: true })
      );
  }, [filtered]);

  const latestBilan = bilan.length ? bilan[bilan.length - 1] : null;
  const hasFilters = Boolean(zone || material || dnClass || search);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} /> Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Réseau &amp; Fuites</span>
      </div>

      {/* Filtres */}
      <div className="dashboard-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '12px' }}>
        <div>
          <span className="filter-label">Zone commerciale</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Toutes les zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="filter-label">Matériau</span>
          <select value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="">Tous</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>{MATERIAL_LABEL[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="filter-label">Diamètre</span>
          <select value={dnClass} onChange={(e) => setDnClass(e.target.value)}>
            <option value="">Tous</option>
            {DN_CLASSES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="filter-label">Zone hydraulique</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ex. HRA3, KO5…"
            style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: 150,
            }}
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            className="badge-pill"
            onClick={() => { setZone(''); setMaterial(''); setDnClass(''); setSearch(''); }}
            style={{ cursor: 'pointer', border: '1px solid var(--border-color)', background: 'transparent' }}
          >
            ✕ Réinitialiser
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
          {loading ? 'Chargement Supabase…' : error ? 'Erreur de synchronisation' : 'Source : Supabase · actualisation automatique'}
        </div>
        <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
          <span />
          {loading ? 'Actualisation…' : error ? 'Erreur' : 'Données chargées'}
        </div>
      </div>

      {error && (
        <div className="db-error-banner">
          {error}
          <button type="button" onClick={() => setReloadToken((t) => t + 1)} style={{ marginLeft: '12px' }}>
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      )}

      {/* En-tête */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>
            <Network size={20} style={{ display: 'inline', marginRight: '6px', color: '#06b6d4' }} />
            Réseau de distribution — Conakry
          </h2>
          <p>
            Linéaire, matériau, diamètre et âge des conduites par zone hydraulique
            {zone ? ` · zone ${zone}` : ` · ${zones.length} zones commerciales`}
          </p>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="subpage-kpi-grid">
        <Tile icon={<Ruler size={20} />} color="#06b6d4" title="Linéaire de conduites" value={loading && !conduites.length ? '—' : km(agg.total)}
          foot={`${num(agg.count)} tronçons recensés`} />
        <Tile icon={<Layers size={20} />} color="#a78bfa" title="Zones hydrauliques" value={String(hydraulicZones)}
          foot={zone ? `Zone ${zone}` : `${zones.length} zones commerciales`} />
        <Tile icon={<CalendarClock size={20} />} color="#f59e0b" title="Âge moyen du réseau"
          value={meanYear ? `${CURRENT_YEAR - meanYear} ans` : '—'}
          foot={meanYear ? `Pose moyenne pondérée : ${meanYear}` : 'Années de pose non renseignées'} />
        <Tile icon={<AlertTriangle size={20} />} color="#ef4444" title={`Conduites de plus de ${OLD_THRESHOLD} ans`}
          value={agg.datedLength > 0 ? pct1(agg.oldLength / agg.datedLength) : '—'}
          foot={agg.oldLength > 0 ? `${km(agg.oldLength)} posés avant ${CURRENT_YEAR - OLD_THRESHOLD}` : 'Aucune'}
          footClass={agg.oldLength > 0 ? 'warning' : 'positive'} />
      </div>

      {/* Composition par matériau + indicateur de pertes */}
      <div className="two-col-grid">
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>Composition du réseau</h3>
            <span className="badge-pill cyan">{km(agg.total)}</span>
          </div>
          {agg.total === 0 ? (
            <Empty loading={loading} text="Aucune conduite pour ces filtres." />
          ) : (
            <>
              <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', gap: 2, margin: '8px 0 14px' }}>
                {MATERIALS.filter((m) => agg.byMaterial[m] > 0).map((m) => (
                  <div key={m} title={`${MATERIAL_LABEL[m]} : ${km(agg.byMaterial[m])}`}
                    style={{ width: `${(agg.byMaterial[m] / agg.total) * 100}%`, background: MATERIAL_COLOR[m] }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {MATERIALS.map((m) => (
                  <div key={m} style={{ borderLeft: `3px solid ${MATERIAL_COLOR[m]}`, padding: '4px 10px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{MATERIAL_LABEL[m]}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>{pct1(agg.total ? agg.byMaterial[m] / agg.total : 0)}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{km(agg.byMaterial[m])}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Par classe de diamètre</div>
                {byDn.map((d) => (
                  <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.label}</span>
                    <div style={{ height: 8, background: 'rgba(148,163,184,0.12)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${maxDnLength ? (d.length / maxDnLength) * 100 : 0}%`, height: '100%', background: '#0284c7', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-strong)' }}>
                      {km(d.length)} <span style={{ color: 'var(--text-dim)' }}>({d.count})</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <LossesCard bilan={bilan} latest={latestBilan} loading={loading} />
      </div>

      {/* Linéaire par zone commerciale */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Linéaire par zone commerciale et par matériau</h3>
          <span className="badge-pill cyan">km</span>
        </div>
        {byZone.length === 0 ? (
          <Empty loading={loading} text="Aucune conduite pour ces filtres." />
        ) : (
          <div style={{ width: '100%', height: Math.max(220, byZone.length * 46 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byZone} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                <XAxis type="number" stroke="#556c84" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} km`} />
                <YAxis type="category" dataKey="zone" stroke="#556c84" fontSize={12} tickLine={false} axisLine={false} width={90} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  formatter={(v: any, name: any) => [`${Number(v).toLocaleString('fr-FR')} km`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {MATERIALS.map((m, i) => (
                  <Bar key={m} dataKey={m} name={MATERIAL_LABEL[m]} stackId="z" fill={MATERIAL_COLOR[m]} stroke="var(--bg-card)" strokeWidth={1}
                    radius={i === MATERIALS.length - 1 ? [0, 4, 4, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Profil d'âge */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Profil d&apos;âge — linéaire posé par décennie</h3>
          <span className="badge-pill amber">{agg.oldLength > 0 ? `${km(agg.oldLength)} de plus de ${OLD_THRESHOLD} ans` : 'Âge'}</span>
        </div>
        {byDecade.length === 0 ? (
          <Empty loading={loading} text="Années de pose non renseignées." />
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDecade} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#556c84" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.25)' }} />
                <YAxis stroke="#556c84" fontSize={11} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => `${v} km`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  labelFormatter={(l: any) => `Posé dans les années ${l}`}
                  formatter={(v: any, name: any) => [`${Number(v).toLocaleString('fr-FR')} km`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {MATERIALS.map((m, i) => (
                  <Bar key={m} dataKey={m} name={MATERIAL_LABEL[m]} stackId="d" fill={MATERIAL_COLOR[m]} stroke="var(--bg-card)" strokeWidth={1}
                    radius={i === MATERIALS.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Zones hydrauliques */}
      <div className="dashboard-card" style={{ borderTop: '3px solid #06b6d4' }}>
        <div className="card-header-flex">
          <div>
            <h3 style={{ fontSize: 16 }}>Conduites par zone hydraulique</h3>
            <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              {hydraulicTable.length} zones hydrauliques · cliquez sur une zone pour voir le détail des tronçons
            </p>
          </div>
          <span className="badge-pill cyan">{num(agg.count)} tronçons</span>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: 640, overflowY: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Zone hydraulique</th>
                <th>Zone commerciale</th>
                <th style={{ minWidth: 180 }}>Linéaire</th>
                <th>Composition</th>
                <th>DN max</th>
                <th>Pose moyenne</th>
                <th>&gt; {OLD_THRESHOLD} ans</th>
              </tr>
            </thead>
            <tbody>
              {hydraulicTable.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                    {loading ? 'Chargement des données…' : 'Aucune zone ne correspond aux filtres.'}
                  </td>
                </tr>
              )}
              {hydraulicTable.map(({ zh, zone: z, rows, agg: a, dominant }) => {
                const open = expanded === zh;
                const year = avgYear(a);
                const oldShare = a.datedLength > 0 ? a.oldLength / a.datedLength : 0;
                const maxZone = hydraulicTable.reduce((acc, h) => Math.max(acc, h.agg.total), 0);
                return (
                  <Fragment key={zh}>
                    <tr onClick={() => setExpanded(open ? null : zh)} style={{ cursor: 'pointer', background: open ? 'rgba(56,189,248,0.08)' : undefined }}>
                      <td style={{ color: 'var(--text-dim)' }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td><strong style={{ color: 'var(--text-strong)' }}>{zh}</strong></td>
                      <td>{z}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 60, height: 6, background: 'rgba(148,163,184,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${maxZone ? (a.total / maxZone) * 100 : 0}%`, height: '100%', background: '#06b6d4', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--text-strong)', minWidth: 70, textAlign: 'right' }}>{km(a.total)}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', height: 8, width: 90, borderRadius: 4, overflow: 'hidden', gap: 1 }}
                          title={MATERIALS.map((m) => `${MATERIAL_LABEL[m]} ${pct1(a.total ? a.byMaterial[m] / a.total : 0)}`).join(' · ')}>
                          {MATERIALS.filter((m) => a.byMaterial[m] > 0).map((m) => (
                            <div key={m} style={{ width: `${(a.byMaterial[m] / a.total) * 100}%`, background: MATERIAL_COLOR[m] }} />
                          ))}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 3 }}>surtout {MATERIAL_LABEL[dominant]}</div>
                      </td>
                      <td>DN {a.maxDn}</td>
                      <td>{year ?? '—'}</td>
                      <td>
                        <span style={{ color: oldShare > 0.5 ? '#ef4444' : oldShare > 0 ? '#f59e0b' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {pct1(oldShare)}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td />
                        <td colSpan={7} style={{ padding: '6px 8px 14px' }}>
                          <table className="dark-table" style={{ fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th>Diamètre</th>
                                <th>Matériau</th>
                                <th>Longueur</th>
                                <th>Année de pose</th>
                                <th>Âge</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows
                                .slice()
                                .sort((x, y) => y.diametre_mm - x.diametre_mm)
                                .map((r) => (
                                  <tr key={r.id}>
                                    <td>DN {r.diametre_mm}</td>
                                    <td>
                                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: MATERIAL_COLOR[asMaterial(r.nature)], marginRight: 6 }} />
                                      {MATERIAL_LABEL[asMaterial(r.nature)]}
                                      {r.nature_source.toUpperCase() !== r.nature ? <span style={{ color: 'var(--text-dim)' }}> ({r.nature_source})</span> : null}
                                    </td>
                                    <td>{num(r.longueur_ml)} m</td>
                                    <td>{r.annee_pose ?? '—'}</td>
                                    <td>{r.annee_pose ? `${CURRENT_YEAR - r.annee_pose} ans` : '—'}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <AlertCircle size={16} />
          <span>Sources et limites</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Inventaire des conduites : document « Réseau SEG Conakry » (DCGT/DPR). Les zones Kaloum, Dixinn et Cimenterie ne
          sont pas renseignées dans ce document. Âges calculés à partir de l&apos;année de pose déclarée ; certaines années
          anciennes (ex. 1903) sont à confirmer par le service réseau. Aucune télémétrie (pressions, débits de nuit) ni
          registre de fuites n&apos;est encore connecté : l&apos;indicateur de pertes ci-dessus est un bilan produit / distribué.
          {lastRefresh ? ` Mise à jour : ${new Date(lastRefresh).toLocaleString('fr-FR')}.` : ''}
        </p>
      </div>
    </div>
  );
}

/* ===================================================================== */

function Tile({ icon, color, title, value, foot, footClass = 'info' }: {
  icon: ReactNode; color: string; title: string; value: string; foot: string; footClass?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <div className="kpi-icon-wrap" style={{ background: `${color}26`, color, border: `1px solid ${color}4d` }}>{icon}</div>
        <div className="kpi-title-value">
          <div className="kpi-title">{title}</div>
          <div className="kpi-num-row">
            <span className="kpi-main-val" style={{ fontSize: '20px' }}>{value}</span>
          </div>
        </div>
      </div>
      <div className="kpi-foot-row">
        <span className={`kpi-trend ${footClass}`}>{foot}</span>
      </div>
    </div>
  );
}

function Empty({ loading, text }: { loading: boolean; text: string }) {
  return (
    <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px', fontSize: '12.5px' }}>
      {loading ? 'Chargement des données…' : text}
    </div>
  );
}

function LossesCard({ bilan, latest, loading }: { bilan: Bilan[]; latest: Bilan | null; loading: boolean }) {
  const lossRatio = latest && latest.produit > 0 ? 1 - latest.distribue / latest.produit : null;
  const period = latest
    ? latest.mois === 12 ? `Année ${latest.exercice}` : `Janvier → ${MONTHS[latest.mois - 1]} ${latest.exercice}`
    : '';

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>
          <Droplets size={16} style={{ display: 'inline', marginRight: 6, color: '#06b6d4', verticalAlign: '-2px' }} />
          Eau produite non distribuée
        </h3>
        <span className="badge-pill cyan">{period || '—'}</span>
      </div>
      {!latest ? (
        <Empty loading={loading} text="Bilan produit / distribué indisponible." />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '6px 0 4px' }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: lossRatio !== null && lossRatio > 0.15 ? '#ef4444' : '#f59e0b' }}>
              {lossRatio !== null ? pct1(lossRatio) : '—'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>du volume produit (Grand Conakry)</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Produit : <strong style={{ color: 'var(--text-strong)' }}>{num(latest.produit)} m³</strong><br />
            Distribué aux agences : <strong style={{ color: 'var(--text-strong)' }}>{num(latest.distribue)} m³</strong><br />
            Écart : <strong style={{ color: 'var(--text-strong)' }}>{num(latest.produit - latest.distribue)} m³</strong>
          </div>

          {bilan.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Historique</div>
              {bilan.map((b) => {
                const r = b.produit > 0 ? 1 - b.distribue / b.produit : 0;
                return (
                  <div key={b.exercice} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', alignItems: 'center', gap: 10, padding: '3px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {b.exercice}{b.mois < 12 ? ` (jan.–${MONTHS[b.mois - 1].slice(0, 4).toLowerCase()}.)` : ''}
                    </span>
                    <div style={{ height: 8, background: 'rgba(148,163,184,0.12)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, r * 400)}%`, height: '100%', background: '#f59e0b', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-strong)' }}>{pct1(r)}</span>
                  </div>
                );
              })}
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 4 }}>Barre pleine = 25 % du volume produit.</div>
            </div>
          )}

          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 12, lineHeight: 1.5 }}>
            Cet écart regroupe pertes physiques (fuites, casses) et volumes non comptés entre la production et les agences.
            Il ne remplace pas une mesure de fuites par secteur.
          </div>
        </>
      )}
    </div>
  );
}
