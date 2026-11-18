'use client';

import { useEffect, useMemo, useState } from 'react';
import { Target, Factory, Building2, PowerOff, TrendingDown, RefreshCw, ArrowUpDown, AlertTriangle } from 'lucide-react';

/* Taux de réalisation de la production (Grand Conakry + centres de l'intérieur).
   Données : /api/kpi/realisation-production (table seg_production_realisation). */

type Site = {
  zone: 'grand_conakry' | 'centres';
  numero: number | null;
  site: string;
  cap_px_m3h: number | null;
  prod_m3h: number | null;
  conso_horaire_lh: number | null;
  capacite_m3j: number | null;
  volume_produit_m3: number;
  volume_moyen_m3j: number | null;
  ratio_capacite: number | null;
  taux_annuel: number | null;
  prevision_annuelle_m3: number | null;
  observation: string | null;
  anomalie_source: string | null;
  periode_debut: string;
  periode_fin: string;
  nb_jours: number;
  date_document: string | null;
};
type Synth = {
  zone: 'grand_conakry' | 'centres' | 'national';
  nb_sites: number; sites_a_l_arret: number; sites_sous_50: number;
  capacite_m3j: number; volume_produit_m3: number; volume_moyen_m3j: number;
  ratio_capacite: number; prevision_annuelle_m3: number; taux_annuel: number;
};

const ZONE: Record<string, string> = { grand_conakry: 'Grand Conakry', centres: 'Centres de l’intérieur', national: 'National' };
const n = (v: unknown) => Number(v ?? 0);
const nb = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
const pc = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${nb(n(v) * 100, d)} %`);
const m3 = (v: number) => (Math.abs(v) >= 1e6 ? `${nb(v / 1e6, 2)} M m³` : `${nb(v)} m³`);
const dateFr = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const moisFr = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });

function couleur(r: number | null) {
  const v = n(r);
  if (v === 0) return 'var(--text-dim)';
  if (v < 0.5) return 'var(--accent-red)';
  if (v < 0.8) return 'var(--accent-amber)';
  if (v <= 1.05) return 'var(--accent-green)';
  return 'var(--accent-purple)';
}

type Tri = 'ratio' | 'volume' | 'site' | 'taux' | 'capacite';

export function ProductionRealisation() {
  const [sites, setSites] = useState<Site[]>([]);
  const [synth, setSynth] = useState<Synth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zone, setZone] = useState<'tous' | 'grand_conakry' | 'centres'>('tous');
  const [tri, setTri] = useState<Tri>('ratio');
  const [desc, setDesc] = useState(true);

  const charger = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/kpi/realisation-production', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Erreur');
      setSites(j.data?.sites ?? []);
      setSynth(j.data?.synthese ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les données');
    } finally { setLoading(false); }
  };
  useEffect(() => { charger(); }, []);

  const s0 = sites[0];
  const nat = synth.find((x) => x.zone === 'national');
  const gc = synth.find((x) => x.zone === 'grand_conakry');
  const ce = synth.find((x) => x.zone === 'centres');
  const attendu = s0 ? s0.nb_jours / 365 : 0;

  const liste = useMemo(() => {
    const l = sites.filter((s) => zone === 'tous' || s.zone === zone);
    const val = (s: Site) => (tri === 'site' ? s.site : tri === 'volume' ? n(s.volume_produit_m3) : tri === 'taux' ? n(s.taux_annuel) : tri === 'capacite' ? n(s.capacite_m3j) : n(s.ratio_capacite));
    return [...l].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'fr') : (x as number) - (y as number);
      return desc ? -c : c;
    });
  }, [sites, zone, tri, desc]);

  const trier = (t: Tri) => { if (t === tri) setDesc((d) => !d); else { setTri(t); setDesc(t !== 'site'); } };
  const max = Math.max(1.2, ...liste.map((s) => n(s.ratio_capacite)));

  return (
    <div className="pr">
      <style>{CSS}</style>
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><Target size={18} /> Réalisation de la production</h2>
          <p>{s0 ? `${cap(moisFr(s0.periode_debut))} – ${moisFr(s0.periode_fin)} ${s0.periode_fin.slice(0, 4)} · ${s0.nb_jours} jours · DPR, rapport du ${dateFr(s0.date_document)}` : 'Taux de réalisation par site'}</p>
        </div>
        <button className="pr-btn" onClick={charger} title="Actualiser"><RefreshCw size={15} className={loading ? 'pr-spin' : ''} /></button>
      </div>

      {error && <div className="pr-error">{error}</div>}
      {!loading && !error && !sites.length && <div className="pr-vide">Aucune donnée. Exécutez le script 08_production_realisation_2026_supabase.sql dans Supabase.</div>}

      {nat && (
        <>
          <div className="pr-kpis">
            <Kpi icon={<Factory size={17} />} c="var(--brand-cyan)" label="Production nationale" v={m3(n(nat.volume_produit_m3))} sub={`${nb(n(nat.volume_moyen_m3j))} m³/j · ${pc(nat.ratio_capacite)} de la capacité`} />
            {gc && <Kpi icon={<Building2 size={17} />} c="var(--brand-blue)" label="Grand Conakry" v={pc(gc.ratio_capacite)} sub={`${m3(n(gc.volume_produit_m3))} · ${gc.nb_sites} sites`} jauge={n(gc.ratio_capacite)} />}
            {ce && <Kpi icon={<Building2 size={17} />} c="var(--accent-amber)" label="Centres de l’intérieur" v={pc(ce.ratio_capacite)} sub={`${m3(n(ce.volume_produit_m3))} · ${ce.nb_sites} centres`} jauge={n(ce.ratio_capacite)} />}
            <Kpi icon={<Target size={17} />} c="var(--accent-green)" label="Objectif annuel atteint" v={pc(nat.taux_annuel)} sub={`${pc(attendu)} attendu à cette date`} jauge={n(nat.taux_annuel)} repere={attendu} />
            <Kpi icon={<PowerOff size={17} />} c="var(--accent-red)" label="Sites à l’arrêt" v={nb(n(nat.sites_a_l_arret))} sub={sites.filter((s) => n(s.volume_produit_m3) === 0).map((s) => s.site).join(', ') || 'aucun'} />
            <Kpi icon={<TrendingDown size={17} />} c="var(--accent-orange)" label="Sous 50 % de capacité" v={nb(n(nat.sites_sous_50))} sub="sites en production" />
          </div>

          <div className="pr-grid">
            <section className="pr-card">
              <div className="pr-card-head">
                <b>Production par rapport à la capacité</b>
                <div className="pr-tabs">
                  {(['tous', 'grand_conakry', 'centres'] as const).map((z) => (
                    <button key={z} className={zone === z ? 'on' : ''} onClick={() => setZone(z)}>{z === 'tous' ? 'Tous' : ZONE[z]}</button>
                  ))}
                </div>
              </div>
              <div className="pr-legende">
                <span><i style={{ background: 'var(--accent-green)' }} /> ≥ 80 %</span>
                <span><i style={{ background: 'var(--accent-amber)' }} /> 50 – 80 %</span>
                <span><i style={{ background: 'var(--accent-red)' }} /> &lt; 50 %</span>
                <span><i style={{ background: 'var(--accent-purple)' }} /> au-dessus de la capacité</span>
                <span className="pr-trait">| 100 % de la capacité</span>
              </div>
              <div className="pr-barres">
                {liste.map((s) => {
                  const r = n(s.ratio_capacite);
                  return (
                    <div key={`${s.zone}-${s.site}`} className="pr-barre" title={`${s.site} : ${pc(r)} de la capacité (${nb(n(s.volume_moyen_m3j))} m³/j sur ${nb(n(s.capacite_m3j))} m³/j)`}>
                      <span className="pr-barre-nom">{s.site}{zone === 'tous' && <small>{s.zone === 'grand_conakry' ? 'GC' : 'Centre'}</small>}</span>
                      <span className="pr-barre-piste">
                        <i style={{ width: `${Math.min(100, (r / max) * 100)}%`, background: couleur(r) }} />
                        <em style={{ left: `${(1 / max) * 100}%` }} />
                      </span>
                      <span className="pr-barre-val" style={{ color: couleur(r) }}>{r === 0 ? 'Arrêt' : pc(r, 0)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="pr-card">
              <div className="pr-card-head"><b>Points d’attention</b></div>
              <ul className="pr-points">
                {sites.filter((s) => n(s.volume_produit_m3) === 0).map((s) => (
                  <li key={`a-${s.site}`} className="rouge"><b>{s.site} à l’arrêt</b><span>{s.observation} · {nb(n(s.capacite_m3j))} m³/j de capacité perdue</span></li>
                ))}
                {sites.filter((s) => n(s.volume_produit_m3) > 0 && n(s.ratio_capacite) < 0.3).sort((a, b) => n(a.ratio_capacite) - n(b.ratio_capacite)).map((s) => (
                  <li key={`f-${s.site}`} className="orange"><b>{s.site} : {pc(s.ratio_capacite)} de la capacité</b><span>{s.observation}</span></li>
                ))}
                {sites.filter((s) => s.anomalie_source).map((s) => (
                  <li key={`x-${s.site}`} className="violet"><b>{s.site}</b><span>{s.anomalie_source}</span></li>
                ))}
                {gc && ce && (
                  <li className="bleu"><b>Poids de Yessouloun</b><span>{(() => { const y = sites.find((s) => /yessoul/i.test(s.site)); return y ? `${pc(n(y.volume_produit_m3) / n(nat.volume_produit_m3))} de la production nationale à lui seul.` : ''; })()}</span></li>
                )}
              </ul>
            </section>
          </div>

          <section className="pr-card">
            <div className="pr-card-head"><b>Détail par site</b><small>{liste.length} sites · cliquer un titre pour trier</small></div>
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th onClick={() => trier('site')}>Site <ArrowUpDown size={11} /></th>
                    <th>Zone</th>
                    <th className="num" onClick={() => trier('capacite')}>Capacité (m³/j) <ArrowUpDown size={11} /></th>
                    <th className="num" onClick={() => trier('volume')}>Volume produit (m³) <ArrowUpDown size={11} /></th>
                    <th className="num">Moyen (m³/j)</th>
                    <th className="num" onClick={() => trier('ratio')}>% capacité <ArrowUpDown size={11} /></th>
                    <th className="num" onClick={() => trier('taux')}>% objectif annuel <ArrowUpDown size={11} /></th>
                    <th>Observation</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((s) => (
                    <tr key={`t-${s.zone}-${s.site}`}>
                      <td className="nom">{s.site}{s.anomalie_source && <AlertTriangle size={12} className="pr-warn" />}</td>
                      <td>{s.zone === 'grand_conakry' ? 'Grand Conakry' : 'Centre'}</td>
                      <td className="num">{nb(n(s.capacite_m3j))}</td>
                      <td className="num">{nb(n(s.volume_produit_m3))}</td>
                      <td className="num">{nb(n(s.volume_moyen_m3j))}</td>
                      <td className="num"><span className="pr-pill" style={{ color: couleur(s.ratio_capacite), borderColor: couleur(s.ratio_capacite) }}>{n(s.ratio_capacite) === 0 ? 'Arrêt' : pc(s.ratio_capacite)}</span></td>
                      <td className="num">{pc(s.taux_annuel)}</td>
                      <td className="obs">{s.observation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pr-note">« % capacité » : production moyenne journalière rapportée à la capacité. « % objectif annuel » : volume produit rapporté à la prévision de l’année ({pc(attendu)} attendu à fin {s0 ? moisFr(s0.periode_fin) : ''}). La ligne TOTAL du Grand Conakry du fichier source (126,9 %) était erronée : la valeur recalculée est {pc(gc?.ratio_capacite)}.</p>
          </section>
        </>
      )}
    </div>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function Kpi({ icon, c, label, v, sub, jauge, repere }: { icon: React.ReactNode; c: string; label: string; v: string; sub: string; jauge?: number; repere?: number }) {
  return (
    <div className="pr-kpi" style={{ ['--kc' as string]: c }}>
      <div className="pr-kpi-top"><span>{label}</span><i>{icon}</i></div>
      <b>{v}</b>
      <small title={sub}>{sub}</small>
      {jauge != null && (
        <span className="pr-jauge"><i style={{ width: `${Math.min(100, jauge * 100)}%` }} />{repere != null && <em style={{ left: `${repere * 100}%` }} />}</span>
      )}
    </div>
  );
}

const CSS = `
.pr { display: flex; flex-direction: column; gap: 16px; }
.pr-btn { display: inline-flex; align-items: center; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); cursor: pointer; }
.pr-spin { animation: pr-rot 1s linear infinite; } @keyframes pr-rot { to { transform: rotate(360deg); } }
.pr-error { padding: 12px 14px; border-radius: 10px; border: 1px solid var(--accent-red); color: var(--accent-red); font-size: 13px; }
.pr-vide { padding: 28px; text-align: center; color: var(--text-muted); font-size: 13px; }
.pr-kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1400px) { .pr-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 700px) { .pr-kpis { grid-template-columns: 1fr 1fr; } }
.pr-kpi { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 6px; padding: 14px 14px 18px; border-radius: 14px; border: 1px solid var(--border-color);
  background: linear-gradient(160deg, color-mix(in srgb, var(--kc) 13%, var(--bg-card)) 0%, var(--bg-card) 55%); }
.pr-kpi::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--kc); }
.pr-kpi-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.pr-kpi-top span { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-kpi-top i { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: var(--kc); background: color-mix(in srgb, var(--kc) 16%, transparent); flex-shrink: 0; }
.pr-kpi > b { font-size: 26px; font-weight: 800; color: var(--text-strong); line-height: 1.1; letter-spacing: -0.02em; }
.pr-kpi small { font-size: 11.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-jauge { position: absolute; left: 14px; right: 14px; bottom: 8px; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--kc) 15%, transparent); }
.pr-jauge i { display: block; height: 100%; border-radius: 2px; background: var(--kc); }
.pr-jauge em { position: absolute; top: -3px; width: 2px; height: 10px; background: var(--text-strong); border-radius: 1px; }
.pr-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .pr-grid { grid-template-columns: 1fr; } }
.pr-card { border-radius: 14px; border: 1px solid var(--border-color); background: var(--bg-card); overflow: hidden; }
.pr-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
.pr-card-head b { font-size: 13.5px; color: var(--text-primary); }
.pr-card-head small { font-size: 11.5px; color: var(--text-dim); }
.pr-tabs { display: inline-flex; padding: 3px; border-radius: 9px; background: var(--bg-inner); border: 1px solid var(--border-subtle); }
.pr-tabs button { border: 0; background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 7px; cursor: pointer; }
.pr-tabs button.on { background: var(--brand-blue); color: #fff; }
.pr-legende { display: flex; gap: 14px; flex-wrap: wrap; padding: 10px 14px 0; font-size: 11.5px; color: var(--text-muted); }
.pr-legende span { display: inline-flex; align-items: center; gap: 5px; }
.pr-legende i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.pr-trait { color: var(--text-secondary); }
.pr-barres { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 6px; max-height: 620px; overflow-y: auto; }
.pr-barre { display: grid; grid-template-columns: minmax(120px, 190px) 1fr 58px; gap: 10px; align-items: center; font-size: 12.5px; }
.pr-barre-nom { color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.pr-barre-nom small { font-size: 10px; color: var(--text-dim); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 0 4px; }
.pr-barre-piste { position: relative; height: 12px; border-radius: 6px; background: var(--bg-inner); }
.pr-barre-piste i { display: block; height: 100%; border-radius: 6px; animation: pr-pousse .8s ease; }
@keyframes pr-pousse { from { width: 0 !important; } }
.pr-barre-piste em { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text-secondary); opacity: .7; }
.pr-barre-val { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
.pr-points { list-style: none; margin: 0; padding: 8px 0; max-height: 640px; overflow-y: auto; }
.pr-points li { display: flex; flex-direction: column; gap: 2px; padding: 9px 14px 9px 16px; border-left: 3px solid transparent; font-size: 12.5px; }
.pr-points li b { color: var(--text-strong); }
.pr-points li span { color: var(--text-muted); }
.pr-points li.rouge { border-left-color: var(--accent-red); }
.pr-points li.orange { border-left-color: var(--accent-amber); }
.pr-points li.violet { border-left-color: var(--accent-purple); }
.pr-points li.bleu { border-left-color: var(--brand-cyan); }
.pr-table-wrap { overflow: auto; max-height: 560px; }
.pr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.pr-table th { position: sticky; top: 0; background: var(--bg-card); text-align: left; padding: 9px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); border-bottom: 1px solid var(--border-color); white-space: nowrap; cursor: pointer; user-select: none; }
.pr-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); white-space: nowrap; }
.pr-table tr:hover td { background: var(--bg-card-hover); }
.pr-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.pr-table td.nom { font-weight: 700; }
.pr-table td.obs { white-space: normal; color: var(--text-muted); min-width: 240px; }
.pr-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid; font-weight: 800; font-size: 11.5px; }
.pr-warn { color: var(--accent-purple); margin-left: 6px; vertical-align: -1px; }
.pr-note { margin: 0; padding: 10px 14px 14px; font-size: 11.5px; color: var(--text-dim); }
`;
