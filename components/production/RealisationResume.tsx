'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, ChevronRight } from 'lucide-react';

/* Bloc « Taux de réalisation de la production » pour la Vue Nationale
   et la page Production & Réservoirs. Source : /api/kpi/realisation-production. */

type Site = { zone: 'grand_conakry' | 'centres'; site: string; capacite_m3j: number; volume_produit_m3: number; ratio_capacite: number | null; observation: string | null; periode_debut: string; periode_fin: string; nb_jours: number };
type Synth = { zone: string; nb_sites: number; sites_a_l_arret: number; sites_sous_50: number; volume_produit_m3: number; volume_moyen_m3j: number; ratio_capacite: number; taux_annuel: number };

const n = (v: unknown) => Number(v ?? 0);
const pc = (v: number, d = 1) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;
const m3 = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mm³` : `${Math.round(v).toLocaleString('fr-FR')} m³`);
const mois = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' });
const col = (r: number) => (r === 0 ? '#64748b' : r < 0.5 ? '#ef4444' : r < 0.8 ? '#f59e0b' : r <= 1.05 ? '#10b981' : '#a78bfa');

export function RealisationResume({ variante = 'national' }: { variante?: 'national' | 'conakry' }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [synth, setSynth] = useState<Synth[]>([]);
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'erreur' | 'vide'>('chargement');

  useEffect(() => {
    let actif = true;
    fetch('/api/kpi/realisation-production', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!actif) return;
        if (!j.ok) { setEtat('erreur'); return; }
        if (!j.data?.sites?.length) { setEtat('vide'); return; }
        setSites(j.data.sites); setSynth(j.data.synthese ?? []); setEtat('ok');
      })
      .catch(() => actif && setEtat('erreur'));
    return () => { actif = false; };
  }, []);

  const s0 = sites[0];
  const nat = synth.find((x) => x.zone === 'national');
  const gc = synth.find((x) => x.zone === 'grand_conakry');
  const ce = synth.find((x) => x.zone === 'centres');
  const attendu = s0 ? s0.nb_jours / 365 : 0;
  const periode = s0 ? `${mois(s0.periode_debut)} → ${mois(s0.periode_fin)} ${s0.periode_fin.slice(0, 4)}` : '';

  const barres = (variante === 'conakry' ? sites.filter((s) => s.zone === 'grand_conakry') : sites)
    .slice().sort((a, b) => n(a.ratio_capacite) - n(b.ratio_capacite))
    .slice(0, variante === 'conakry' ? 16 : 8);
  const arret = sites.filter((s) => n(s.volume_produit_m3) === 0);

  return (
    <div className="dashboard-card">
      <style>{CSS}</style>
      <div className="card-header-flex">
        <h3><Target size={15} style={{ display: 'inline', marginRight: 6, color: '#10b981', verticalAlign: '-2px' }} />Taux de réalisation de la production</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {periode && <span className="badge-pill cyan">{periode} · source DPR</span>}
          <Link href="/kpi/realisation-production" className="notif-link-btn" style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: 2 }}>Détail <ChevronRight size={12} /></Link>
        </div>
      </div>

      {etat !== 'ok' || !nat ? (
        <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center', fontSize: 12.5 }}>
          {etat === 'chargement' ? 'Chargement…' : etat === 'vide' ? 'Données de réalisation non chargées.' : 'Source indisponible.'}
        </div>
      ) : (
        <div className="rr">
          <div className="rr-kpis">
            {variante === 'national' && <Mini label="National" v={pc(n(nat.ratio_capacite))} sub={`${m3(n(nat.volume_produit_m3))} produits`} r={n(nat.ratio_capacite)} />}
            {gc && <Mini label="Grand Conakry" v={pc(n(gc.ratio_capacite))} sub={`${m3(n(gc.volume_produit_m3))} · ${gc.nb_sites} sites`} r={n(gc.ratio_capacite)} />}
            {ce && <Mini label="Centres de l’intérieur" v={pc(n(ce.ratio_capacite))} sub={`${m3(n(ce.volume_produit_m3))} · ${ce.nb_sites} centres`} r={n(ce.ratio_capacite)} />}
            <Mini label="Objectif annuel" v={pc(n(nat.taux_annuel))} sub={`${pc(attendu)} attendu à cette date`} r={n(nat.taux_annuel) / (attendu || 1)} />
          </div>

          <div className="rr-corps">
            <div className="rr-barres">
              <div className="rr-titre">{variante === 'conakry' ? 'Sites du Grand Conakry · % de la capacité' : 'Sites les plus en difficulté · % de la capacité'}</div>
              {barres.map((s) => {
                const r = n(s.ratio_capacite);
                return (
                  <div key={`${s.zone}-${s.site}`} className="rr-barre" title={s.observation ?? ''}>
                    <span className="rr-nom">{s.site}</span>
                    <span className="rr-piste"><i style={{ width: `${Math.min(100, (r / 1.2) * 100)}%`, background: col(r) }} /><em /></span>
                    <span className="rr-val" style={{ color: col(r) }}>{r === 0 ? 'Arrêt' : pc(r, 0)}</span>
                  </div>
                );
              })}
            </div>
            <div className="rr-points">
              <div className="rr-titre">À retenir</div>
              {arret.map((s) => (
                <div key={s.site} className="rr-point rouge"><b>{s.site} à l’arrêt</b><span>{s.observation} · {Math.round(n(s.capacite_m3j)).toLocaleString('fr-FR')} m³/j perdus</span></div>
              ))}
              <div className="rr-point orange"><b>{nat.sites_sous_50} sites sous 50 % de leur capacité</b><span>Cause la plus citée : indisponibilité des installations et irrégularité de l’électricité.</span></div>
              <div className="rr-point bleu"><b>Objectif annuel : {pc(n(nat.taux_annuel))} atteint</b><span>{pc(attendu)} attendu à fin {s0 ? new Date(`${s0.periode_fin}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' }) : ''}, soit {((attendu - n(nat.taux_annuel)) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} points de retard.</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, v, sub, r }: { label: string; v: string; sub: string; r: number }) {
  return (
    <div className="rr-mini" style={{ ['--rc' as string]: col(r) }}>
      <small>{label}</small>
      <b>{v}</b>
      <span>{sub}</span>
      <i style={{ width: `${Math.min(100, r * 100)}%` }} />
    </div>
  );
}

const CSS = `
.rr { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }
.rr-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.rr-mini { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 3px; padding: 11px 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); }
.rr-mini small { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); }
.rr-mini b { font-size: 22px; font-weight: 800; color: var(--rc); line-height: 1.1; }
.rr-mini span { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-mini i { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--rc); }
.rr-corps { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr); gap: 14px; }
@media (max-width: 900px) { .rr-corps { grid-template-columns: 1fr; } }
.rr-titre { font-size: 10.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
.rr-barres { display: flex; flex-direction: column; gap: 6px; }
.rr-barres .rr-titre { margin-bottom: 4px; }
.rr-barre { display: grid; grid-template-columns: minmax(90px, 150px) 1fr 48px; gap: 8px; align-items: center; font-size: 12px; }
.rr-nom { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-piste { position: relative; height: 9px; border-radius: 5px; background: rgba(255,255,255,0.06); }
.rr-piste i { display: block; height: 100%; border-radius: 5px; }
.rr-piste em { position: absolute; left: 83.33%; top: -3px; bottom: -3px; width: 2px; background: rgba(226,232,240,.55); }
.rr-val { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
.rr-points { display: flex; flex-direction: column; gap: 8px; }
.rr-point { display: flex; flex-direction: column; gap: 2px; padding: 7px 10px; border-left: 3px solid; border-radius: 4px; background: rgba(255,255,255,0.02); font-size: 11.5px; }
.rr-point b { color: var(--text-strong); font-size: 12px; }
.rr-point span { color: var(--text-muted); }
.rr-point.rouge { border-color: #ef4444; } .rr-point.orange { border-color: #f59e0b; } .rr-point.bleu { border-color: #38bdf8; }
`;
