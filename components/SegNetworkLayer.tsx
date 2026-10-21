'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataRefresh } from '@/lib/use-data-version';

/* =====================================================================
 * Calque « Réseau SEG » — TRACÉ SCHÉMATIQUE
 *
 * L'inventaire des conduites (seg_reseau_conduites) ne contient pas de
 * géométrie : on relie donc les sites de production aux agences de
 * Conakry par des lignes schématiques. Les positions des agences et des sites de
 * production ci-dessous sont APPROXIMATIVES et doivent être validées par
 * le service SIG.
 *
 * Les épaisseurs suivent les diamètres réellement présents dans
 * l'inventaire (adductions DN 1100 fonte 1994 et DN 700 acier 1964).
 * Les infobulles affichent le linéaire réel par zone (API /api/reseau).
 * ===================================================================== */

type Point = { name: string; lat: number; lon: number };

// Projection lat/lon -> coordonnées SVG de la carte nationale (viewBox 960x620).
// Calage linéaire vérifié sur les 24 villes de guinea-map-data (écart < 0,2).
export function projectToMap(lat: number, lon: number) {
  return {
    x: 217.7 + (lon + 13.6785) * 112.65,
    y: 349.2 - (lat - 9.537) * 94.88,
  };
}

// Agences commerciales — position indicative du quartier (à valider SIG).
const AGENCIES: Point[] = [
  { name: 'Kaloum', lat: 9.509, lon: -13.712 },
  { name: 'Dixinn', lat: 9.545, lon: -13.672 },
  { name: 'Matam', lat: 9.545, lon: -13.647 },
  { name: 'Ratoma', lat: 9.585, lon: -13.652 },
  { name: 'Matoto', lat: 9.605, lon: -13.585 },
  { name: 'Wanindara', lat: 9.63, lon: -13.58 },
  { name: 'Cimenterie', lat: 9.62, lon: -13.6 },
  { name: 'Yimbaya', lat: 9.632, lon: -13.57 },
  { name: 'Kountia', lat: 9.7, lon: -13.55 },
  { name: 'Coyah', lat: 9.7078, lon: -13.3831 },
  { name: 'Dubreka', lat: 9.7911, lon: -13.5186 },
];

// Sites de production — positions approximatives (à valider SIG).
const PRODUCTION_SITES: Point[] = [
  { name: 'Station de Yessoulou', lat: 9.76, lon: -13.29 },
  { name: 'Forages de Kakoulima', lat: 9.79, lon: -13.44 },
];

type Segment = {
  id: string;
  from: string;
  to: string;
  kind: 'adduction-1100' | 'adduction-700' | 'distribution';
  label: string;
};

// Axe principal Yessoulou → Kaloum puis antennes vers chaque agence.
const SEGMENTS: Segment[] = [
  ...[
    ['Station de Yessoulou', 'Coyah'],
    ['Coyah', 'Kountia'],
    ['Kountia', 'Yimbaya'],
    ['Yimbaya', 'Matoto'],
    ['Matoto', 'Matam'],
    ['Matam', 'Dixinn'],
    ['Dixinn', 'Kaloum'],
  ].flatMap(([from, to]) => [
    { id: `a1100-${from}-${to}`, from, to, kind: 'adduction-1100' as const, label: 'Adduction DN 1100 fonte (1994)' },
    { id: `a700-${from}-${to}`, from, to, kind: 'adduction-700' as const, label: 'Adduction DN 700 acier (1964)' },
  ]),
  { id: 'd-kount-wani', from: 'Kountia', to: 'Wanindara', kind: 'distribution', label: 'Distribution' },
  { id: 'd-wani-cim', from: 'Wanindara', to: 'Cimenterie', kind: 'distribution', label: 'Distribution' },
  { id: 'd-kak-cim', from: 'Forages de Kakoulima', to: 'Cimenterie', kind: 'distribution', label: 'Forages de Kakoulima' },
  { id: 'd-kak-dub', from: 'Forages de Kakoulima', to: 'Dubreka', kind: 'distribution', label: 'Forages de Kakoulima' },
  { id: 'd-dix-rat', from: 'Dixinn', to: 'Ratoma', kind: 'distribution', label: 'Distribution' },
  { id: 'd-mat-rat', from: 'Matoto', to: 'Ratoma', kind: 'distribution', label: 'Distribution' },
];

const STYLE = {
  'adduction-1100': { color: '#0ea5e9', width: 3.2, offset: 0.9 },
  'adduction-700': { color: '#38bdf8', width: 2.2, offset: -0.9 },
  distribution: { color: '#7dd3fc', width: 1.4, offset: 0 },
} as const;

type ZoneStat = { lineaire: number; zones: number; annee: number | null };

export function SegNetworkLayer({ zoom = 1, visible = true }: { zoom?: number; visible?: boolean }) {
  const [stats, setStats] = useState<Map<string, ZoneStat>>(new Map());

  // Statistiques réelles par zone commerciale (si l'API /api/reseau est disponible).
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    fetch('/api/reseau', { cache: 'no-store', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (!result?.ok) return;
        const map = new Map<string, ZoneStat & { weighted: number; dated: number; zh: Set<string> }>();
        for (const c of result.data?.conduites ?? []) {
          const key = String(c.zone_commerciale);
          const s = map.get(key) ?? { lineaire: 0, zones: 0, annee: null, weighted: 0, dated: 0, zh: new Set<string>() };
          const len = Number(c.longueur_ml) || 0;
          s.lineaire += len;
          s.zh.add(String(c.zone_hydraulique));
          if (c.annee_pose) { s.weighted += Number(c.annee_pose) * len; s.dated += len; }
          map.set(key, s);
        }
        const out = new Map<string, ZoneStat>();
        map.forEach((s, k) => out.set(k, { lineaire: s.lineaire, zones: s.zh.size, annee: s.dated ? Math.round(s.weighted / s.dated) : null }));
        setStats(out);
      })
      .catch(() => { /* calque affiché sans statistiques */ });
    return () => controller.abort();
  }, [visible]);

  const points = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const p of [...PRODUCTION_SITES, ...AGENCIES]) map.set(p.name, projectToMap(p.lat, p.lon));
    return map;
  }, []);

  if (!visible) return null;

  const z = Math.max(zoom, 0.5);

  return (
    <g className="seg-network-layer" pointerEvents="visiblePainted">
      {SEGMENTS.map((seg) => {
        const a = points.get(seg.from);
        const b = points.get(seg.to);
        if (!a || !b) return null;
        const st = STYLE[seg.kind];
        // Décalage perpendiculaire pour dessiner les deux adductions côte à côte.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * (st.offset / z);
        const oy = (dx / len) * (st.offset / z);
        const d = `M ${a.x + ox} ${a.y + oy} L ${b.x + ox} ${b.y + oy}`;
        return (
          <g key={seg.id}>
            <path className="seg-net" d={d} stroke="rgba(2,6,23,0.75)" strokeWidth={(st.width + 1.6) / z} strokeLinecap="round" fill="none" />
            <path className="seg-net" d={d} stroke={st.color} strokeWidth={st.width / z} strokeLinecap="round" fill="none">
              <title>{`${seg.label} — ${seg.from} → ${seg.to} (tracé schématique)`}</title>
            </path>
            {seg.kind !== 'distribution' && (
              <path className="seg-net" d={d} stroke="rgba(255,255,255,0.85)" strokeWidth={(st.width * 0.35) / z} strokeLinecap="round"
                strokeDasharray={`${2 / z} ${6 / z}`} fill="none" pointerEvents="none">
                <animate attributeName="stroke-dashoffset" from={`${16 / z}`} to="0" dur="1.6s" repeatCount="indefinite" />
              </path>
            )}
          </g>
        );
      })}

      {/* Sites de production */}
      {PRODUCTION_SITES.map((site) => {
        const p = points.get(site.name);
        if (!p) return null;
        return (
          <g key={site.name} transform={`translate(${p.x}, ${p.y})`}>
            <circle className="seg-net" r={5 / z} fill="#0ea5e9" stroke="#e0f2fe" strokeWidth={1.4 / z}>
              <title>{`${site.name} — position approximative (à valider SIG)`}</title>
            </circle>
            {z >= 4 && (
              <text className="seg-net" x={7 / z} y={3 / z} fontSize={9 / z} fill="#e0f2fe" fontWeight={700} pointerEvents="none">{site.name}</text>
            )}
          </g>
        );
      })}

      {/* Nœuds agences avec statistiques réseau */}
      {AGENCIES.map((agency) => {
        const p = points.get(agency.name);
        if (!p) return null;
        const s = stats.get(agency.name);
        const tip = s
          ? `${agency.name} — réseau : ${(s.lineaire / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km, ${s.zones} zones hydrauliques${s.annee ? `, pose moyenne ${s.annee}` : ''}`
          : `${agency.name} — inventaire des conduites non renseigné`;
        return (
          <circle className="seg-net" key={agency.name} cx={p.x} cy={p.y} r={(s ? 3.2 : 2.4) / z} fill={s ? '#38bdf8' : 'transparent'} stroke="#38bdf8" strokeWidth={1.2 / z}>
            <title>{tip}</title>
          </circle>
        );
      })}
    </g>
  );
}

export function SegNetworkLegend() {
  const row = (color: string, width: number, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 20, height: width, background: color, borderRadius: 2, display: 'inline-block' }} />
      <span>{label}</span>
    </div>
  );
  return (
    <div
      style={{
        position: 'absolute', right: 12, bottom: 12, zIndex: 30,
        background: 'rgba(8, 20, 36, 0.88)', border: '1px solid rgba(56,189,248,0.35)', borderRadius: 8,
        padding: '8px 10px', fontSize: 10.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 5,
        backdropFilter: 'blur(6px)', pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, color: '#38bdf8' }}>Réseau SEG — tracé schématique</div>
      {row(STYLE['adduction-1100'].color, 4, 'Adduction DN 1100 fonte (1994)')}
      {row(STYLE['adduction-700'].color, 3, 'Adduction DN 700 acier (1964)')}
      {row(STYLE.distribution.color, 2, 'Distribution vers les agences')}
      <div style={{ color: '#94a3b8', maxWidth: 210, lineHeight: 1.4 }}>
        Tracé indicatif : l&apos;inventaire ne contient pas de géométrie. Survolez une agence pour son linéaire.
      </div>
    </div>
  );
}

/* =====================================================================
 * Résumé réel de la carte (remplace les compteurs écrits en dur).
 * Chaque chiffre vient d'une API ; une source indisponible affiche « — ».
 * ===================================================================== */

export type SegSummaryItem = { label: string; value: string; color: string; source: string };

export function useSegMapSummary(year: number): SegSummaryItem[] {
  const [items, setItems] = useState<SegSummaryItem[]>([]);
  const refreshTick = useDataRefresh();

  useEffect(() => {
    const controller = new AbortController();
    const get = (url: string) =>
      fetch(url, { cache: 'no-store', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([
      get('/api/filters'),
      get(`/api/kpi/facturation-centres?year=${year}`),
      get(`/api/kpi/production-distribution?year=${year}`),
      get(`/api/technique?year=${year}`),
      get(`/api/evenements?year=${year}`),
    ]).then(([filters, billing, production, technique, registre]) => {
      if (controller.signal.aborted) return;
      const fmt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('fr-FR') : '—');
      const agencies = Array.isArray(filters?.data?.agencies) ? filters.data.agencies.length : null;
      const centres = Array.isArray(billing?.data?.centers) ? billing.data.centers.length : null;
      const k = production?.data?.kpis;
      const stationRows: Array<{ center_name?: string }> = Array.isArray(technique?.data?.centers) ? technique.data.centers : [];
      const stations = technique?.ok ? new Set(stationRows.map((c) => String(c.center_name ?? '').trim()).filter(Boolean)).size : null;
      const stopRows = (stationRows as Array<{ center_name?: string; treated_water_m3?: unknown }>).filter(
        (c) => String(c.center_name ?? '').trim() && (Number(c.treated_water_m3) || 0) === 0
      );
      const stoppedCenters = technique?.ok ? new Set(stopRows.map((c) => String(c.center_name).trim())).size : null;
      setItems([
        { label: 'Agences de Conakry', value: fmt(agencies), color: '#10b981', source: 'Référentiel des agences' },
        { label: 'Centres de l’intérieur', value: fmt(centres), color: '#22d3ee', source: `Facturation ${year}` },
        { label: 'Sites de production (Conakry)', value: fmt(k?.sitesTotal), color: '#0ea5e9', source: 'Production DPR' },
        { label: 'Stations des centres', value: fmt(stations), color: '#06b6d4', source: `Relevés techniques ${year}` },
        {
          label: 'Arrêts de production déclarés',
          value: stoppedCenters === null ? '—' : `${stoppedCenters} centres · ${stopRows.length} mois`,
          color: '#ef4444',
          source: `Relevés techniques ${year} : mois à 0 m³ d'eau traitée`,
        },
        ...(registre?.ok
          ? (() => {
              const ev = (registre.data?.events ?? []) as Array<{ nature?: string; statut?: string }>;
              const active = (n: string) => ev.filter((e) => e.nature === n && (e.statut === 'ouvert' || e.statut === 'en_cours')).length;
              const total = (n: string) => ev.filter((e) => e.nature === n && e.statut !== 'annule').length;
              return [
                { label: 'Incidents déclarés', value: `${total('incident')} · ${active('incident')} actifs`, color: '#dc2626', source: `Registre de terrain ${year}` },
                { label: 'Missions déclarées', value: `${total('mission')} · ${active('mission')} en cours`, color: '#d97706', source: `Registre de terrain ${year}` },
              ];
            })()
          : []),
        { label: 'Réservoirs (Conakry)', value: fmt(k?.reservoirsCount), color: '#3b82f6', source: 'Fiches techniques' },
        { label: 'Zones hydrauliques', value: fmt(k?.reseauZones), color: '#a78bfa', source: 'Inventaire du réseau' },
        {
          label: 'Réseau recensé',
          value: typeof k?.reseauLineaire === 'number' ? `${Math.round(k.reseauLineaire / 1000).toLocaleString('fr-FR')} km` : '—',
          color: '#38bdf8',
          source: 'Inventaire du réseau',
        },
      ]);
    });

    return () => controller.abort();
  }, [year, refreshTick]);

  return items;
}

/* =====================================================================
 * Marqueurs réels de la carte (remplacent les marqueurs de démonstration)
 *
 * - Stations : centres d'exploitation des relevés techniques
 *   (seg_technique_center_monthly), placés au chef-lieu correspondant,
 *   + station de traitement de Yessoulou (Grand Conakry).
 * - Réservoirs : les 14 ouvrages de seg_reservoirs (Conakry). Leur position
 *   est APPROXIMATIVE (quartier indiqué dans la fiche technique).
 * - Arrêts de production déclarés : mois où un centre a déclaré 0 m³ d'eau
 *   traitée dans seg_technique_center_monthly (catégorie « incident » de la carte).
 * - Incidents et missions déclarés : registre seg_evenements_terrain
 *   (/api/evenements). Position : coordonnées saisies, sinon chef-lieu du
 *   centre, sinon Conakry pour une agence.
 * ===================================================================== */

const MONTH_SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export type SegRealMarker = {
  id: string;
  type: 'pompage' | 'reservoir' | 'incident' | 'mission';
  name: string;
  location: string;
  region: string;
  status: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
};

const normKey = (value: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

// Chefs-lieux (coordonnées publiques des localités) — région = libellé des régions de la carte.
const TOWNS: Array<{ name: string; region: string; lat: number; lon: number }> = [
  { name: 'Conakry', region: 'Conakry', lat: 9.537, lon: -13.6785 },
  { name: 'Boké', region: 'Boké', lat: 10.9322, lon: -14.2961 },
  { name: 'Kamsar', region: 'Boké', lat: 10.6667, lon: -14.6 },
  { name: 'Fria', region: 'Boké', lat: 10.3667, lon: -13.5833 },
  { name: 'Boffa', region: 'Boké', lat: 10.18, lon: -14.04 },
  { name: 'Gaoual', region: 'Boké', lat: 11.75, lon: -13.2 },
  { name: 'Koundara', region: 'Boké', lat: 12.48, lon: -13.3 },
  { name: 'Kindia', region: 'Kindia', lat: 10.0569, lon: -12.8658 },
  { name: 'Coyah', region: 'Kindia', lat: 9.7078, lon: -13.3831 },
  { name: 'Dubréka', region: 'Kindia', lat: 9.7911, lon: -13.5186 },
  { name: 'Forécariah', region: 'Kindia', lat: 9.43, lon: -13.09 },
  { name: 'Télimélé', region: 'Kindia', lat: 10.9, lon: -13.04 },
  { name: 'Mamou', region: 'Mamou', lat: 10.3756, lon: -12.0911 },
  { name: 'Dalaba', region: 'Mamou', lat: 10.6869, lon: -12.2497 },
  { name: 'Pita', region: 'Mamou', lat: 11.0597, lon: -12.3956 },
  { name: 'Labé', region: 'Labé', lat: 11.3181, lon: -12.2894 },
  { name: 'Mali', region: 'Labé', lat: 12.0753, lon: -12.3011 },
  { name: 'Lélouma', region: 'Labé', lat: 11.43, lon: -12.69 },
  { name: 'Tougué', region: 'Labé', lat: 11.44, lon: -11.66 },
  { name: 'Faranah', region: 'Faranah', lat: 10.0404, lon: -10.7434 },
  { name: 'Dabola', region: 'Faranah', lat: 10.7489, lon: -11.1072 },
  { name: 'Dinguiraye', region: 'Faranah', lat: 11.2995, lon: -10.7155 },
  { name: 'Kissidougou', region: 'Faranah', lat: 9.1848, lon: -10.0999 },
  { name: 'Kankan', region: 'Kankan', lat: 10.3854, lon: -9.3057 },
  { name: 'Kouroussa', region: 'Kankan', lat: 10.6489, lon: -9.885 },
  { name: 'Siguiri', region: 'Kankan', lat: 11.4228, lon: -9.1756 },
  { name: 'Mandiana', region: 'Kankan', lat: 10.6176, lon: -8.6916 },
  { name: 'Kérouané', region: 'Kankan', lat: 9.27, lon: -9.01 },
  { name: 'Guéckédou', region: "N'Zérékoré", lat: 8.5646, lon: -10.1311 },
  { name: 'Macenta', region: "N'Zérékoré", lat: 8.5434, lon: -9.4705 },
  { name: "N'Zérékoré", region: "N'Zérékoré", lat: 7.7562, lon: -8.8179 },
  { name: 'Lola', region: "N'Zérékoré", lat: 7.8022, lon: -8.5333 },
  { name: 'Yomou', region: "N'Zérékoré", lat: 7.57, lon: -9.25 },
];

// Variantes d'orthographe rencontrées dans les relevés techniques.
const TOWN_ALIASES: Record<string, string> = {
  telemele: 'Télimélé',
  kkanforages: 'Kankan',
  guekegou: 'Guéckédou',
  gueckedougou: 'Guéckédou',
};

function findTown(centerName: string) {
  const alias = TOWN_ALIASES[normKey(centerName)];
  const key = normKey(alias ?? centerName);
  if (!key) return null;
  return (
    TOWNS.find((t) => normKey(t.name) === key) ??
    TOWNS.find((t) => key.startsWith(normKey(t.name)) || normKey(t.name).startsWith(key)) ??
    null
  );
}

// Position approximative des réservoirs (quartier de la fiche technique) — à valider SIG.
const RESERVOIR_POSITIONS: Array<{ match: string; lat: number; lon: number }> = [
  { match: 'aviation', lat: 9.577, lon: -13.612 },
  { match: 'bellevue', lat: 9.535, lon: -13.676 },
  { match: 'kaloum', lat: 9.6, lon: -13.648 },
  { match: 'almamiyah', lat: 9.512, lon: -13.712 },
  { match: 'chateaudekoloma', lat: 9.628, lon: -13.614 },
  { match: 'koloma', lat: 9.623, lon: -13.62 },
  { match: 'simbaya', lat: 9.64, lon: -13.59 },
  { match: 'kaporo', lat: 9.62, lon: -13.66 },
  { match: 'jica1', lat: 9.58, lon: -13.6 },
  { match: 'jica2', lat: 9.605, lon: -13.572 },
  { match: 'jica3', lat: 9.68, lon: -13.575 },
  { match: 'sonfoniah', lat: 9.67, lon: -13.6 },
  { match: 'cimenterie1', lat: 9.7, lon: -13.555 },
  { match: 'cimenterie2', lat: 9.706, lon: -13.545 },
];

export function useSegRealMarkers(year: number): SegRealMarker[] {
  const [markers, setMarkers] = useState<SegRealMarker[]>([]);
  const refreshTick = useDataRefresh();

  useEffect(() => {
    const controller = new AbortController();
    const get = (url: string) =>
      fetch(url, { cache: 'no-store', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([
      get(`/api/technique?year=${year}`),
      get(`/api/kpi/production-distribution?year=${year}`),
      get(`/api/evenements?year=${year}`),
    ]).then(
      ([technique, production, registre]) => {
        if (controller.signal.aborted) return;
        const out: SegRealMarker[] = [];

        // Stations des centres de l'intérieur
        const byCenter = new Map<string, { treated: number; months: Set<string>; stopped: Map<string, number> }>();
        for (const row of (technique?.data?.centers ?? []) as Array<Record<string, unknown>>) {
          const name = String(row.center_name ?? '').trim();
          if (!name) continue;
          const current = byCenter.get(name) ?? { treated: 0, months: new Set<string>(), stopped: new Map<string, number>() };
          const month = String(row.period_month ?? '').slice(0, 7);
          const treated = Number(row.treated_water_m3) || 0;
          current.treated += treated;
          current.months.add(month);
          // Ligne déclarée avec 0 m³ d'eau traitée : arrêt de production déclaré.
          if (month && treated === 0) current.stopped.set(month, Number(row.raw_water_m3) || 0);
          byCenter.set(name, current);
        }
        const perTown = new Map<string, number>();
        byCenter.forEach((value, name) => {
          const town = findTown(name);
          if (!town) return;
          // Plusieurs centres dans la même ville (ex. forages) : léger décalage.
          const rank = perTown.get(town.name) ?? 0;
          perTown.set(town.name, rank + 1);
          const p = projectToMap(town.lat + rank * 0.05, town.lon + rank * 0.07);
          out.push({
            id: `station-${normKey(name)}`,
            type: 'pompage',
            name: `Centre de ${name}`,
            location: town.name,
            region: town.region,
            status: `Eau traitée ${year} : ${Math.round(value.treated).toLocaleString('fr-FR')} m³ (${value.months.size} mois)`,
            lat: town.lat,
            lon: town.lon,
            x: p.x,
            y: p.y,
          });

          if (value.stopped.size > 0) {
            const months = Array.from(value.stopped.keys()).sort();
            const label = months.map((m) => MONTH_SHORT_FR[Number(m.slice(5, 7)) - 1] ?? m).join(', ');
            const raw = Array.from(value.stopped.values()).reduce((a, v) => a + v, 0);
            const pi = projectToMap(town.lat + rank * 0.05 + 0.09, town.lon + rank * 0.07 + 0.09);
            out.push({
              id: `arret-${normKey(name)}`,
              type: 'incident',
              name: `Arrêt de production — Centre de ${name}`,
              location: town.name,
              region: town.region,
              status: `0 m³ d'eau traitée déclaré en ${label} ${year} (${months.length} mois)${raw > 0 ? ` · eau brute déclarée ${Math.round(raw).toLocaleString('fr-FR')} m³` : ''} · source : relevés techniques`,
              lat: town.lat,
              lon: town.lon,
              x: pi.x,
              y: pi.y,
            });
          }
        });

        // Station de traitement de Yessoulou (Grand Conakry)
        const k = production?.data?.kpis;
        if (k) {
          const site = PRODUCTION_SITES[0];
          const p = projectToMap(site.lat, site.lon);
          const yess = (production?.data?.sites ?? []).find((s: { site_nom?: string }) => normKey(String(s.site_nom ?? '')).startsWith('yessoulou'));
          out.push({
            id: 'station-yessoulou',
            type: 'pompage',
            name: site.name,
            location: 'Coyah (position approximative)',
            region: 'Kindia',
            status: yess ? `Production ${year} : ${Math.round(Number(yess.volume) || 0).toLocaleString('fr-FR')} m³` : 'Grand Conakry',
            lat: site.lat,
            lon: site.lon,
            x: p.x,
            y: p.y,
          });
        }

        // Réservoirs de Conakry
        for (const r of (production?.data?.reservoirs ?? []) as Array<Record<string, unknown>>) {
          const fullKey = String(r.nom ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          const key = fullKey.replace(/^reservoirde|^chateaude|^chateaud/, '');
          const pos =
            RESERVOIR_POSITIONS.find((p) => fullKey.includes(p.match)) ??
            RESERVOIR_POSITIONS.find((p) => key.includes(p.match));
          if (!pos) continue;
          const p = projectToMap(pos.lat, pos.lon);
          const capacity = Number(r.capacite_m3) || 0;
          out.push({
            id: `reservoir-${r.id}`,
            type: 'reservoir',
            name: String(r.nom ?? 'Réservoir'),
            location: `${String(r.localisation ?? 'Conakry')} (position approximative)`,
            region: 'Conakry',
            status: `Capacité ${capacity.toLocaleString('fr-FR')} m³${r.annee_mise_en_service ? ` · mise en service ${r.annee_mise_en_service}` : ''}`,
            lat: pos.lat,
            lon: pos.lon,
            x: p.x,
            y: p.y,
          });
        }

        // Incidents et missions déclarés dans le registre de terrain
        const STATUT: Record<string, string> = { ouvert: 'ouvert', en_cours: 'en cours', resolu: 'résolu', annule: 'annulé' };
        const placed = new Map<string, number>();
        for (const e of (registre?.data?.events ?? []) as Array<Record<string, unknown>>) {
          if (e.statut === 'annule') continue;
          const nature = e.nature === 'mission' ? 'mission' : 'incident';
          const centre = typeof e.centre_nom === 'string' ? e.centre_nom : '';
          const town = centre ? findTown(centre) : null;
          let lat = typeof e.latitude === 'number' ? e.latitude : null;
          let lon = typeof e.longitude === 'number' ? e.longitude : null;
          let approx = false;
          if (lat === null || lon === null) {
            approx = true;
            if (town) { lat = town.lat; lon = town.lon; }
            else if (e.agency_id !== null && e.agency_id !== undefined) { lat = 9.537; lon = -13.6785; }
            else continue;
          }
          // Plusieurs événements au même endroit : petit décalage en couronne.
          const spot = `${lat.toFixed(2)}:${lon.toFixed(2)}`;
          const k = placed.get(spot) ?? 0;
          placed.set(spot, k + 1);
          const angle = (k * 2.4) % (2 * Math.PI);
          const r = approx ? 0.12 + 0.04 * Math.floor(k / 6) : 0.03 * k;
          const p = projectToMap(lat + Math.sin(angle) * r, lon + Math.cos(angle) * r);
          const place = centre ? `Centre de ${centre}` : e.agency_name ? `Agence ${String(e.agency_name)}` : 'Conakry';
          const debut = new Date(String(e.date_debut)).toLocaleDateString('fr-FR');
          const parts = [
            `${String(e.categorie ?? '')} · ${STATUT[String(e.statut)] ?? String(e.statut)}`,
            e.gravite ? `gravité ${String(e.gravite)}` : '',
            `depuis le ${debut}`,
            e.equipe ? `équipe : ${String(e.equipe)}` : '',
          ].filter(Boolean);
          out.push({
            id: `evt-${String(e.id)}`,
            type: nature,
            name: `${nature === 'mission' ? 'Mission' : 'Incident'} — ${String(e.titre ?? '')}`,
            location: `${place}${e.installation ? ` · ${String(e.installation)}` : ''}${approx ? ' (position approximative)' : ''}`,
            region: town?.region ?? 'Conakry',
            status: parts.join(' · '),
            lat,
            lon,
            x: p.x,
            y: p.y,
          });
        }

        setMarkers(out);
      }
    );

    return () => controller.abort();
  }, [year, refreshTick]);

  return markers;
}
