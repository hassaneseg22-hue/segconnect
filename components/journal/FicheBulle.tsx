'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Users, Search, Trash2 } from 'lucide-react';

/* Bulle d'information de l'assistant du journal (ex. fiche RH).
   Se ferme avec le bouton « Effacer », la croix, la touche Échap ou un clic à côté. */

export type Carte = {
  titre: string;
  sousTitre?: string;
  stats?: { label: string; valeur: string }[];
  barres?: { titre: string; items: { label: string; valeur: number }[] }[];
  sections?: { titre: string; colonnes: string[]; lignes: string[][]; total: number }[];
  note?: string;
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Section({ s }: { s: NonNullable<Carte['sections']>[number] }) {
  const [filtre, setFiltre] = useState('');
  const lignes = useMemo(() => {
    const f = norm(filtre.trim());
    return f ? s.lignes.filter((l) => norm(l.join(' ')).includes(f)) : s.lignes;
  }, [s.lignes, filtre]);
  return (
    <div className="fb-section">
      <div className="fb-section-head">
        <b>{s.titre}</b>
        <small>{filtre ? `${lignes.length} / ` : ''}{s.total.toLocaleString('fr-FR')} ligne{s.total > 1 ? 's' : ''}</small>
        {s.lignes.length > 6 && (
          <label className="fb-search">
            <Search size={13} />
            <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Filtrer…" />
          </label>
        )}
      </div>
      <div className="fb-table-wrap">
        <table className="fb-table">
          <thead><tr>{s.colonnes.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {lignes.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
            {!lignes.length && <tr><td colSpan={s.colonnes.length} className="fb-vide">Aucun résultat</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FicheBulle({ carte, onClose }: { carte: Carte | null; onClose: () => void }) {
  useEffect(() => {
    if (!carte) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [carte, onClose]);

  if (!carte) return null;
  return (
    <div className="fb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div className="fb-bulle" role="dialog" aria-label={carte.titre}>
        <div className="fb-head">
          <span className="fb-icon"><Users size={18} /></span>
          <div className="fb-titres">
            <h3>{carte.titre}</h3>
            {carte.sousTitre && <p>{carte.sousTitre}</p>}
          </div>
          <button className="fb-effacer" onClick={onClose} title="Effacer la bulle"><Trash2 size={14} /> Effacer</button>
          <button className="fb-x" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="fb-corps">
          {!!carte.stats?.length && (
            <div className="fb-stats">
              {carte.stats.map((s) => (
                <div key={s.label} className="fb-stat"><small>{s.label}</small><b>{s.valeur}</b></div>
              ))}
            </div>
          )}

          {!!carte.barres?.length && (
            <div className="fb-barres">
              {carte.barres.map((g) => {
                const max = Math.max(1, ...g.items.map((i) => i.valeur));
                return (
                  <div key={g.titre} className="fb-barre-groupe">
                    <b>{g.titre}</b>
                    {g.items.map((i) => (
                      <div key={i.label} className="fb-barre">
                        <span className="fb-barre-label" title={i.label}>{i.label}</span>
                        <span className="fb-barre-piste"><i style={{ width: `${(i.valeur / max) * 100}%` }} /></span>
                        <span className="fb-barre-val">{i.valeur.toLocaleString('fr-FR')}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {carte.sections?.map((s) => <Section key={s.titre} s={s} />)}

          {carte.note && <p className="fb-note">{carte.note}</p>}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.fb-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px;
  background: rgba(2, 8, 16, .55); backdrop-filter: blur(3px); animation: fb-fond .2s ease; }
@keyframes fb-fond { from { opacity: 0; } }
.fb-bulle { width: min(1040px, 100%); max-height: 86vh; display: flex; flex-direction: column; border-radius: 18px; overflow: hidden;
  background: var(--bg-card); border: 1px solid var(--border-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-cyan) 30%, transparent), 0 30px 80px rgba(0, 0, 0, .55);
  animation: fb-in .28s cubic-bezier(.2, .9, .3, 1.2); }
@keyframes fb-in { from { opacity: 0; transform: translateY(14px) scale(.97); } }
.fb-head { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(120deg, color-mix(in srgb, var(--brand-cyan) 14%, var(--bg-card)), var(--bg-card) 60%); }
.fb-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; color: var(--brand-cyan); background: color-mix(in srgb, var(--brand-cyan) 16%, transparent); flex-shrink: 0; }
.fb-titres { flex: 1; min-width: 0; }
.fb-titres h3 { margin: 0; font-size: 18px; font-weight: 800; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-titres p { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
.fb-effacer { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-inner); color: var(--text-secondary); }
.fb-effacer:hover { border-color: var(--accent-red); color: var(--accent-red); }
.fb-x { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; }
.fb-x:hover { color: var(--text-strong); background: var(--bg-card-hover); }
.fb-corps { padding: 16px 18px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.fb-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.fb-stat { padding: 11px 13px; border-radius: 12px; background: var(--bg-inner); border: 1px solid var(--border-subtle); min-width: 0; }
.fb-stat small { display: block; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-stat b { display: block; margin-top: 4px; font-size: 18px; font-weight: 800; color: var(--text-strong); overflow-wrap: anywhere; }
.fb-barres { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.fb-barre-groupe { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-inner); display: flex; flex-direction: column; gap: 7px; }
.fb-barre-groupe > b { font-size: 12.5px; color: var(--text-primary); margin-bottom: 2px; }
.fb-barre { display: grid; grid-template-columns: minmax(90px, 38%) 1fr 48px; align-items: center; gap: 8px; font-size: 12px; }
.fb-barre-label { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-barre-piste { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--brand-cyan) 10%, transparent); overflow: hidden; }
.fb-barre-piste i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--brand-blue), var(--brand-cyan)); animation: fb-barre .7s ease; }
@keyframes fb-barre { from { width: 0 !important; } }
.fb-barre-val { text-align: right; font-weight: 700; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.fb-section { border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; }
.fb-section-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-inner); border-bottom: 1px solid var(--border-subtle); }
.fb-section-head b { font-size: 13px; color: var(--text-primary); }
.fb-section-head small { font-size: 11.5px; color: var(--text-dim); }
.fb-search { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); }
.fb-search input { border: 0; outline: 0; background: transparent; color: var(--text-primary); font-size: 12.5px; width: 160px; }
.fb-table-wrap { max-height: 360px; overflow: auto; }
.fb-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.fb-table th { position: sticky; top: 0; z-index: 1; text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); background: var(--bg-card); border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.fb-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); white-space: nowrap; }
.fb-table tbody tr:hover td { background: var(--bg-card-hover); }
.fb-vide { text-align: center; color: var(--text-muted); }
.fb-note { margin: 0; font-size: 12px; color: var(--text-muted); }
@media (max-width: 640px) { .fb-effacer span { display: none; } .fb-overlay { padding: 10px; } }
`;
