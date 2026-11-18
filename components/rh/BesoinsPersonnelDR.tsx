"use client";
// components/rh/BesoinsPersonnelDR.tsx
// Page Ressources humaines : besoins en personnel exprimés par les directions régionales (situations transmises à la DCCCI),
// mis en regard de l'effectif actuel de chaque centre dans la liste du personnel.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { UserPlus } from "lucide-react";
import { NewFeatureBubble } from "@/components/NewFeatureBubble";
import { situations, type LigneSituation, type Situation } from "@/lib/situation-dr";
import { cle, type Agent } from "@/lib/rh-effectif";
import s from "./rh.module.css";
import e from "./effectif.module.css";
import b from "./besoins.module.css";

const CATEGORIE: Record<string, string> = {
  "agent de station": "Agent de station", "agent de zone": "Agent de zone", "plombier": "Plombier",
  "caissière": "Caissier(ère)", "caissier": "Caissier(ère)", "facturier": "Facturier", "chef de centre": "Chef de centre",
};
const COULEUR: Record<string, string> = {
  "Chef de centre": "#c084fc", "Agent de zone": "#38bdf8", "Plombier": "#fbbf24",
  "Agent de station": "#34d399", "Caissier(ère)": "#f472b6", "Facturier": "#2dd4bf",
};
const AUTRE = "#94a3b8";
const fr0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dateLongue = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const pluriel = (n: number, un: string, plusieurs: string) => `${fr0.format(n)} ${n > 1 ? plusieurs : un}`;
const couleur = (profil: string) => COULEUR[CATEGORIE[profil.trim().toLowerCase()] ?? ""] ?? AUTRE;
const varC = (c: string) => ({ ["--c" as string]: c }) as CSSProperties;

type LigneCentre = { profil: string; nombre: number; observation: string | null; actuel: number | null };
type Centre = { centre: string; postes: number; effectif: number; lignes: LigneCentre[]; profilAbsent: boolean };
type Profil = { profil: string; demande: number; actuel: number | null; centres: number };

function analyser(sit: Situation, agents: Agent[]) {
  const duCentre = (centre: string) =>
    agents.filter((a) => a.cf >= "0710" && a.cf.slice(3) !== "0" && cle(a.service) === cle(centre));
  const actuel = (centre: string, profil: string): number | null => {
    const cat = CATEGORIE[profil.trim().toLowerCase()];
    if (!cat || !agents.length) return null;
    return duCentre(centre).filter((a) => a.categorie === cat).length;
  };

  const centres: Centre[] = sit.besoins.map((c) => {
    const lignes = c.lignes.map((l) => ({ ...l, actuel: actuel(c.centre, l.profil) }));
    return {
      centre: c.centre,
      postes: lignes.reduce((n, l) => n + l.nombre, 0),
      effectif: duCentre(c.centre).length,
      lignes,
      profilAbsent: lignes.some((l) => l.actuel === 0),
    };
  }).sort((x, y) => Number(y.profilAbsent) - Number(x.profilAbsent) || y.postes - x.postes || x.centre.localeCompare(y.centre, "fr"));

  const parProfil = new Map<string, Profil>();
  for (const c of centres) for (const l of c.lignes) {
    const k = l.profil.trim();
    const p = parProfil.get(k.toLowerCase()) ?? { profil: k, demande: 0, actuel: 0, centres: 0 };
    p.demande += l.nombre;
    p.actuel = p.actuel === null || l.actuel === null ? null : p.actuel + l.actuel;
    p.centres += 1;
    parProfil.set(k.toLowerCase(), p);
  }
  const profils = [...parProfil.values()].sort((x, y) => y.demande - x.demande || x.profil.localeCompare(y.profil, "fr"));

  const total = centres.reduce((n, c) => n + c.postes, 0);
  const effectif = centres.reduce((n, c) => n + c.effectif, 0);
  const absents = centres.reduce((n, c) => n + c.lignes.filter((l) => l.actuel === 0).length, 0);
  return { centres, profils, total, effectif, absents };
}

export default function BesoinsPersonnelDR({ agents }: { agents: Agent[] }) {
  const [lignes, setLignes] = useState<LigneSituation[] | null>(null);
  useEffect(() => {
    let annule = false;
    fetch("/api/situation-dr", { cache: "no-store", credentials: "include" })
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.ok) throw new Error(); if (!annule) setLignes(j.lignes as LigneSituation[]); })
      .catch(() => { if (!annule) setLignes([]); }); // pas d'accès à ces données : le bloc n'apparaît pas
    return () => { annule = true; };
  }, []);

  const sits = useMemo(() => (lignes ? situations(lignes).filter((x) => x.besoins.length > 0) : []), [lignes]);
  const analyses = useMemo(() => sits.map((sit) => ({ sit, a: analyser(sit, agents) })), [sits, agents]);
  if (!analyses.length) return null;

  const totalGeneral = analyses.reduce((n, x) => n + x.a.total, 0);

  return (
    <NewFeatureBubble id="rh-besoins-personnel-2026-11-v2" block title="Besoins en personnel, nouvelle présentation"
      lines={["Chiffres clés, besoins par profil et une fiche par centre : postes demandés, effectif actuel et effectif après renfort."]}>
      <div className={s.racine}>
        <section className={`dashboard-card ${b.carte}`} aria-labelledby="rh-besoins">
          <header className={b.entete}>
            <div>
              <div className={s.eyebrow}>Renforts demandés</div>
              <h3 id="rh-besoins" className={b.titre}><UserPlus size={20} aria-hidden="true" />Besoins en personnel signalés par les directions régionales</h3>
              <p className={b.sousTitre}>
                {pluriel(totalGeneral, "poste demandé", "postes demandés")} par {analyses.length > 1 ? `${analyses.length} directions régionales` : `la direction régionale de ${analyses[0].sit.dr}`},
                comparés à l’effectif actuel de chaque centre dans la liste du personnel.
              </p>
            </div>
            <span className={b.badgeSource}>Situations transmises à la DCCCI</span>
          </header>

          <div className={b.corps}>
            {analyses.map(({ sit, a }) => (
              <div key={sit.dr} className={b.dr}>
                {analyses.length > 1 && (
                  <h4 className={b.drTitre}>DR {sit.dr} <span>situation du {dateLongue(sit.date)}</span></h4>
                )}

                <div className={b.kpis}>
                  <div className={b.kpi} style={{ ["--accent" as string]: "#38bdf8" }}>
                    <b>{fr0.format(a.total)}</b><span>postes demandés</span>
                    <small>DR {sit.dr}, situation du {dateLongue(sit.date)}</small>
                  </div>
                  <div className={b.kpi} style={{ ["--accent" as string]: "#c084fc" }}>
                    <b>{fr0.format(a.centres.length)}<span style={{ display: "inline", fontSize: 16, color: "var(--t3)" }}> / {fr0.format(Math.max(sit.centres.length, a.centres.length))}</span></b>
                    <span>centres demandent du renfort</span>
                    <small>{sit.centres.length > a.centres.length ? "les autres centres ne signalent aucun besoin" : "tous les centres de la DR sont concernés"}</small>
                  </div>
                  <div className={b.kpi} style={{ ["--accent" as string]: "#34d399" }}>
                    <b>{fr0.format(a.effectif)} → {fr0.format(a.effectif + a.total)}</b>
                    <span>agents dans ces centres, après renfort</span>
                    <small>{a.effectif > 0 ? `soit +${fr0.format(Math.round((a.total / a.effectif) * 100))} % d’effectif` : "effectif actuel inconnu dans la liste du personnel"}</small>
                  </div>
                  {a.absents > 0 && (
                    <div className={b.kpi} style={{ ["--accent" as string]: "#fbbf24" }}>
                      <b>{fr0.format(a.absents)}</b>
                      <span>{a.absents > 1 ? "postes sans aucun titulaire" : "poste sans aucun titulaire"}</span>
                      <small>profil demandé absent du centre dans la liste du personnel : à traiter en priorité</small>
                    </div>
                  )}
                </div>

                <div>
                  <h5 className={b.sousTitreBloc}>Besoins par profil</h5>
                  <div className={b.legende} aria-hidden="true">
                    <span><i style={{ background: "rgba(148,163,184,.45)" }} />En poste aujourd’hui</span>
                    <span><i style={{ background: "repeating-linear-gradient(135deg,#e2e8f0 0 3px,#94a3b8 3px 6px)" }} />Demandé en plus (couleur du profil)</span>
                  </div>
                  <div className={b.profils}>
                    {a.profils.map((p) => {
                      const max = Math.max(...a.profils.map((x) => (x.actuel ?? 0) + x.demande), 1);
                      return (
                        <div key={p.profil} className={b.profil} style={varC(couleur(p.profil))}>
                          <div className={b.profilNom}><span className={b.point} aria-hidden="true" />{p.profil}</div>
                          <div className={b.piste} role="img"
                            aria-label={`${p.profil} : ${p.actuel ?? "effectif inconnu"} en poste, ${p.demande} demandés`}>
                            <span className={b.actuel} style={{ width: `${((p.actuel ?? 0) / max) * 100}%` }} />
                            <span className={b.demande} style={{ width: `${(p.demande / max) * 100}%` }} />
                          </div>
                          <div className={b.profilValeur}>
                            <strong>+{fr0.format(p.demande)}</strong>
                            {p.actuel !== null && <> · {fr0.format(p.actuel)} en poste</>}
                            <small style={{ display: "block", fontSize: 11, color: "var(--t3)" }}>{pluriel(p.centres, "centre", "centres")}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h5 className={b.sousTitreBloc}>Fiche par centre</h5>
                  <div className={b.centres}>
                    {a.centres.map((c) => (
                      <article key={c.centre} className={`${b.centre} ${c.profilAbsent ? b.centreUrgent : ""}`}>
                        <div className={b.centreEntete}>
                          <div>
                            <h6 className={b.centreNom}>{c.centre}</h6>
                            <div className={b.centreMeta}>
                              {c.effectif > 0 ? `${pluriel(c.effectif, "agent", "agents")} aujourd’hui → ${fr0.format(c.effectif + c.postes)} après renfort` : "aucun agent rattaché dans la liste du personnel"}
                            </div>
                          </div>
                          <div className={b.postes}><b>+{fr0.format(c.postes)}</b><span>{c.postes > 1 ? "postes" : "poste"}</span></div>
                        </div>
                        <ul className={b.lignes}>
                          {c.lignes.map((l) => (
                            <li key={l.profil} className={b.ligne} style={varC(couleur(l.profil))}>
                              <div className={b.ligneTete}>
                                <span className={b.point} aria-hidden="true" />
                                <span className={b.ligneProfil}>{l.profil}</span>
                                <span className={b.plus}>+{fr0.format(l.nombre)}</span>
                              </div>
                              {l.actuel !== null && (
                                <div className={b.evolution}>
                                  En poste : <strong className={l.actuel === 0 ? b.zero : undefined}>{l.actuel === 0 ? "aucun" : fr0.format(l.actuel)}</strong>
                                  <span className={b.fleche} aria-hidden="true">→</span>
                                  après renfort : <strong>{fr0.format(l.actuel + l.nombre)}</strong>
                                </div>
                              )}
                              {l.observation && <p className={b.observation}>« {l.observation} »</p>}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </div>

                <details className={b.detail}>
                  <summary>Voir le tableau détaillé ({pluriel(a.centres.reduce((n, c) => n + c.lignes.length, 0), "ligne", "lignes")})</summary>
                  <div className={e.tableauScroll}>
                    <table className={e.tableau}>
                      <thead>
                        <tr><th scope="col">Centre</th><th scope="col" style={{ textAlign: "left" }}>Profil</th><th scope="col">Demandé</th><th scope="col">En poste</th><th scope="col">Après renfort</th><th scope="col" style={{ textAlign: "left" }}>Observation de la DR</th></tr>
                      </thead>
                      <tbody>
                        {a.centres.flatMap((c) => c.lignes.map((l, i) => (
                          <tr key={c.centre + l.profil}>
                            <td>{i === 0 ? <strong>{c.centre}</strong> : ""}</td>
                            <td style={{ textAlign: "left" }}>{l.profil}</td>
                            <td><strong>+{fr0.format(l.nombre)}</strong></td>
                            <td>{l.actuel === null ? "—" : fr0.format(l.actuel)}</td>
                            <td>{l.actuel === null ? "—" : fr0.format(l.actuel + l.nombre)}</td>
                            <td style={{ textAlign: "left" }}>{l.observation ?? "—"}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            ))}
          </div>
          <p className={b.pied}>
            Besoins exprimés tels que transmis par les directions régionales. L’effectif « en poste » vient de la liste du personnel par centre de frais ;
            un poste « sans aucun titulaire » signifie qu’aucun agent de ce profil n’est rattaché au centre dans cette liste.
          </p>
        </section>
      </div>
    </NewFeatureBubble>
  );
}
