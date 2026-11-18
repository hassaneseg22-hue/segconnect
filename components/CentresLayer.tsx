'use client';

import { useEffect, useState } from 'react';
import { projectToMap } from '@/components/SegNetworkLayer';
import type { MarkerData } from '@/lib/guinea-map-data';

export type CentreUrgent = MarkerData & { statut: string; gravite: string; approx: boolean };

/* Coordonnées des chefs-lieux (lat, lon, approximatif).
 * approx = true : position estimée, absente de guineaCities, à valider visuellement. */
const COORDS: Record<string, [number, number, boolean]> = {
  kindia: [10.0569, -12.8658, false],
  boke: [10.9322, -14.2961, false],
  boffa: [10.1667, -14.0333, true],
  forecariah: [9.43, -13.087, true],
  mamou: [10.3756, -12.0911, false],
  koundara: [12.4833, -13.3, true],
  tougue: [11.44, -11.66, true],
  lelouma: [11.3333, -12.5833, true],
  pita: [11.0594, -12.395, false],
  gaoual: [11.75, -13.2, true],
  kankan: [10.3854, -9.3057, false],
  siguiri: [11.4167, -9.1667, false],
  kouroussa: [10.65, -9.8833, false],
  dinguiraye: [11.2917, -10.7167, false],
  faranah: [10.0404, -10.7434, false],
  kissidougou: [9.1848, -10.0999, false],
  labe: [11.3181, -12.2894, false],
  mali: [12.0833, -12.3, true],
  gueckedou: [8.5667, -10.1333, true],
  macenta: [8.5442, -9.4719, true],
  lola: [7.8, -8.5333, true],
  "n'zerekore": [7.7562, -8.8179, true],
  "n’zerekore": [7.7562, -8.8179, true],
  nzerekore: [7.7562, -8.8179, true],
  yomou: [7.5667, -9.2667, true],
};

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const STATUT_LABEL: Record<string, string> = { arret: 'À l’arrêt', perturbe: 'Perturbé', en_cours: 'Réparation en cours' };
const COLOR: Record<string, string> = { arret: '#ef4444', perturbe: '#f59e0b', en_cours: '#38bdf8' };

/** Centres de l'intérieur en difficulté (non résolus), positionnés sur la carte. */
export function useCentresUrgents(): CentreUrgent[] {
  const [items, setItems] = useState<CentreUrgent[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/centres', { cache: 'no-store', credentials: 'include' });
        if (!res.ok) { if (alive) setItems([]); return; } // pas d'accès : couche vide
        const j = await res.json();
        const out: CentreUrgent[] = [];
        for (const r of (j?.rows ?? []) as Array<Record<string, any>>) {
          if (r.statut === 'resolu') continue;
          const c = COORDS[norm(String(r.centre ?? ''))];
          if (!c) continue;
          const p = projectToMap(c[0], c[1]);
          const jours = r.date_debut && r.date_debut_precision !== 'inconnue'
            ? Math.max(0, Math.floor((Date.now() - new Date(r.date_debut).getTime()) / 86400000)) : null;
          const probleme = String(r.probleme ?? '');
          out.push({
            id: `centre-urgent-${r.id}`,
            type: 'incident',
            name: `Centre de ${r.centre}`,
            location: String(r.centre),
            region: String(r.region ?? ''),
            status: `${STATUT_LABEL[r.statut] ?? r.statut}${jours != null ? ` depuis ${jours} j` : ''} — ${probleme.length > 150 ? probleme.slice(0, 149) + '…' : probleme}`,
            lat: c[0], lon: c[1], x: p.x, y: p.y,
            statut: String(r.statut), gravite: String(r.gravite), approx: c[2],
          });
        }
        if (alive) setItems(out);
      } catch { if (alive) setItems([]); }
    };
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return items;
}

/** Couche SVG : triangle d'alerte décalé à côté du point du centre (taille constante au zoom). */
export function CentresLayer({ markers, zoom, visible, onSelect }: {
  markers: CentreUrgent[]; zoom: number; visible: boolean; onSelect: (m: CentreUrgent) => void;
}) {
  if (!visible || markers.length === 0) return null;
  const s = 1 / (zoom || 1);
  return (
    <g id="seg-centres-urgents">
      {markers.map((m) => {
        const c = COLOR[m.statut] ?? '#f59e0b';
        return (
          <g
            key={m.id}
            transform={`translate(${m.x}, ${m.y}) scale(${s})`}
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onSelect(m); }}
          >
            <title>{`${m.name} — ${m.status}`}</title>
            {m.statut === 'arret' && (
              <polygon points="9,-23 -3,-1 21,-1" fill={c} opacity="0.3">
                <animate attributeName="opacity" values="0.5;0.05;0.5" dur="1.6s" repeatCount="indefinite" />
              </polygon>
            )}
            <polygon points="9,-17 1,-3 17,-3" fill={c} stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" />
            <rect x="8.2" y="-13" width="1.6" height="5" fill="#ffffff" />
            <rect x="8.2" y="-6.4" width="1.6" height="1.6" fill="#ffffff" />
          </g>
        );
      })}
    </g>
  );
}
