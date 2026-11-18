'use client';

import { useMemo, useState } from 'react';
import { Crosshair, Globe } from 'lucide-react';
import { guineaRegions, guineaCities, nationalOutlinePath, MAP_CONFIG } from '@/lib/guinea-map-data';

/* Carte de la Guinée du Journal du DG.
   Réutilise la géométrie de la Carte Interactive (lib/guinea-map-data).
   - la région du problème « à la une » s'allume et la carte zoome dessus ;
   - chaque centre en difficulté est un point (rouge = arrêt, orange = perturbé) ;
   - cliquer un point ou une région sélectionne le problème correspondant. */

export type PointCarte = {
  id: number;
  centre: string;
  region: string;
  statut: string;
};

const norm = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

const COULEUR: Record<string, string> = { arret: '#ef4444', perturbe: '#f59e0b', en_cours: '#06b6d4', resolu: '#10b981' };
const ZOOM = 1.75;

export function GuineaJournalMap({
  points, actifId, lecture, onSelect,
}: {
  points: PointCarte[];
  actifId: number | null;
  lecture: boolean;
  onSelect: (id: number) => void;
}) {
  const [suivre, setSuivre] = useState(true);
  const [survol, setSurvol] = useState<number | null>(null);
  const vb = String(MAP_CONFIG.viewBox).trim().split(/[\s,]+/).map(Number);
  const centreX = (vb[0] || 0) + (vb[2] || Number(MAP_CONFIG.width)) / 2;
  const centreY = (vb[1] || 0) + (vb[3] || Number(MAP_CONFIG.height)) / 2;

  const regions = useMemo(() => guineaRegions.map((r) => ({
    key: String(r.id), nom: String(r.name), cle: norm(r.name), path: r.path,
    cx: Number(r.centroid[0]), cy: Number(r.centroid[1]),
  })), []);
  const villes = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    guineaCities.forEach((c) => m.set(norm(c.name), { x: Number(c.x), y: Number(c.y) }));
    return m;
  }, []);

  const trouverRegion = (nom: string) => {
    const k = norm(nom);
    return regions.find((r) => r.cle === k) || regions.find((r) => r.cle.includes(k) || k.includes(r.cle));
  };

  /* Position de chaque centre : la ville si elle est connue, sinon autour du centre de la région */
  const places = useMemo(() => {
    const parRegion = new Map<string, number>();
    return points.map((p) => {
      const v = villes.get(norm(p.centre));
      const reg = trouverRegion(p.region);
      if (v) return { ...p, x: v.x, y: v.y, regionKey: reg?.key };
      if (!reg) return null;
      const n = parRegion.get(reg.key) ?? 0;
      parRegion.set(reg.key, n + 1);
      const a = n * 2.4;
      const r = n === 0 ? 0 : 16 + n * 4;
      return { ...p, x: reg.cx + Math.cos(a) * r, y: reg.cy + 14 + Math.sin(a) * r, regionKey: reg.key };
    }).filter(Boolean) as (PointCarte & { x: number; y: number; regionKey?: string })[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, villes, regions]);

  const comptes = useMemo(() => {
    const m = new Map<string, { n: number; arret: number }>();
    places.forEach((p) => {
      if (!p.regionKey) return;
      const c = m.get(p.regionKey) ?? { n: 0, arret: 0 };
      c.n++; if (p.statut === 'arret') c.arret++;
      m.set(p.regionKey, c);
    });
    return m;
  }, [places]);

  const actif = places.find((p) => p.id === actifId) ?? null;
  const regionActive = actif?.regionKey ?? null;
  const regionNom = regions.find((r) => r.key === regionActive)?.nom;

  const k = suivre && actif ? ZOOM : 1;
  const tx = suivre && actif ? centreX - actif.x * k : 0;
  const ty = suivre && actif ? centreY - actif.y * k : 0;
  const echelle = 1 / k; // garde des points de taille constante

  return (
    <div className="gjm">
      <style>{CSS}</style>
      <div className="gjm-head">
        <div>
          <b>{regionNom ? `Région de ${regionNom}` : 'Guinée'}</b>
          <small>{actif ? actif.centre : `${places.length} centres en difficulté`}</small>
        </div>
        <button className="gjm-toggle" onClick={() => setSuivre((s) => !s)} title={suivre ? 'Voir tout le pays' : 'Suivre le journal'}>
          {suivre ? <><Globe size={13} /> Vue nationale</> : <><Crosshair size={13} /> Suivre le journal</>}
        </button>
      </div>

      <svg className="gjm-svg" viewBox={MAP_CONFIG.viewBox} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="gjmFond" cx="45%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0b2436" />
            <stop offset="100%" stopColor="#06121e" />
          </radialGradient>
          <filter id="gjmGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#22d3ee" floodOpacity="0.75" />
          </filter>
          <filter id="gjmBord" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.35" />
          </filter>
        </defs>

        <g className="gjm-camera" style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})` }}>
          {/* Régions */}
          {regions.map((r) => {
            const c = comptes.get(r.key);
            const on = r.key === regionActive;
            const fill = on
              ? 'rgba(34, 211, 238, 0.30)'
              : c ? (c.arret ? `rgba(239, 68, 68, ${0.10 + Math.min(c.n, 5) * 0.05})` : `rgba(245, 158, 11, ${0.08 + Math.min(c.n, 5) * 0.05})`)
                : 'url(#gjmFond)';
            const premier = places.find((p) => p.regionKey === r.key);
            return (
              <path
                key={r.key}
                d={r.path}
                className={`gjm-region ${on ? 'on' : ''}`}
                fill={fill}
                stroke={on ? '#67e8f9' : 'rgba(56, 189, 248, 0.30)'}
                strokeWidth={(on ? 2.2 : 1) * echelle}
                filter={on ? 'url(#gjmGlow)' : undefined}
                opacity={regionActive && !on && suivre ? 0.55 : 1}
                onClick={() => premier && onSelect(premier.id)}
                style={{ cursor: premier ? 'pointer' : 'default' }}
              />
            );
          })}
          <path d={nationalOutlinePath} fill="none" stroke="#0284c7" strokeWidth={2 * echelle} filter="url(#gjmBord)" pointerEvents="none" />

          {/* Noms des régions */}
          {!(suivre && actif) && regions.map((r) => (
            <text key={`t-${r.key}`} x={r.cx} y={r.cy} className={`gjm-label ${r.key === regionActive ? 'on' : ''}`}
              fontSize={12 * echelle} textAnchor="middle" pointerEvents="none">
              {r.nom.toUpperCase()}
            </text>
          ))}

          {/* Centres */}
          {places.map((p) => {
            const on = p.id === actifId;
            const col = COULEUR[p.statut] ?? '#38bdf8';
            const r = (on ? 7 : 4.5) * echelle;
            return (
              <g key={p.id} transform={`translate(${p.x}, ${p.y})`} className="gjm-point"
                onClick={() => onSelect(p.id)} onMouseEnter={() => setSurvol(p.id)} onMouseLeave={() => setSurvol(null)}>
                {(on || p.statut === 'arret') && (
                  <circle r={r} fill="none" stroke={col} strokeWidth={1.5 * echelle}>
                    <animate attributeName="r" values={`${r};${r * (on ? 4 : 2.6)}`} dur={on && lecture ? '1.1s' : '1.8s'} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0" dur={on && lecture ? '1.1s' : '1.8s'} repeatCount="indefinite" />
                  </circle>
                )}
                <circle r={r} fill={col} stroke="#fff" strokeWidth={(on ? 2 : 1) * echelle} />
                {(on || survol === p.id) && (
                  <g transform={`translate(0, ${-(r + 8 * echelle)})`} pointerEvents="none">
                    <text textAnchor="middle" className="gjm-nom" fontSize={(on ? 13 : 11) * echelle}
                      stroke="#04101b" strokeWidth={3 * echelle} paintOrder="stroke">{p.centre}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="gjm-legende">
        <span><i style={{ background: COULEUR.arret }} /> Arrêt total</span>
        <span><i style={{ background: COULEUR.perturbe }} /> Perturbé</span>
        <span><i className="zone" /> Zone à la une</span>
      </div>
    </div>
  );
}

const CSS = `
.gjm { position: relative; display: flex; flex-direction: column; height: 100%; }
.gjm-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
.gjm-head b { display: block; font-size: 14px; color: var(--text-strong); font-weight: 800; transition: color .3s; }
.gjm-head small { font-size: 12px; color: var(--brand-cyan); font-weight: 600; }
.gjm-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-secondary); cursor: pointer; }
.gjm-toggle:hover { border-color: var(--brand-cyan); color: var(--text-strong); }
.gjm-svg { width: 100%; height: 340px; display: block; background: radial-gradient(ellipse at 50% 45%, #0a1f30 0%, #050d17 75%); }
.gjm-camera { transform-origin: 0 0; transition: transform 1.1s cubic-bezier(.65, 0, .35, 1); }
.gjm-region { transition: fill .6s, stroke .6s, opacity .6s; }
.gjm-region:hover { stroke: #38bdf8; }
.gjm-region.on { animation: gjm-souffle 2.4s ease-in-out infinite; }
@keyframes gjm-souffle { 50% { fill-opacity: .55; } }
.gjm-label { fill: rgba(148, 163, 184, .38); font-weight: 800; letter-spacing: .1em; transition: fill .4s; }
.gjm-label.on { fill: #a5f3fc; }
.gjm-point { cursor: pointer; }
.gjm-nom { fill: #fff; font-weight: 800; }
.gjm-legende { display: flex; gap: 14px; flex-wrap: wrap; padding: 9px 14px; font-size: 11.5px; color: var(--text-muted); border-top: 1px solid var(--border-subtle); }
.gjm-legende span { display: inline-flex; align-items: center; gap: 6px; }
.gjm-legende i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.gjm-legende i.zone { border-radius: 3px; background: rgba(34, 211, 238, .35); border: 1px solid #67e8f9; }
`;
