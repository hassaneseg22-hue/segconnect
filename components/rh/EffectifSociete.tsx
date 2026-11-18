"use client";
// components/rh/EffectifSociete.tsx
// Page Ressources humaines du DG : effectif de toute la société + rapprochement avec la liste des centres.
import { useMemo, useState } from "react";
import { Users, Building2, Search, ArrowRightLeft, ShieldCheck } from "lucide-react";
import { NewFeatureBubble } from "@/components/NewFeatureBubble";
import type { Personne } from "@/lib/rh-agregat";
import {
  agreger, verifierEffectif, rapprocher, POLES, COULEUR_POLE,
  type Agent, type Couple,
} from "@/lib/rh-effectif";
import s from "./rh.module.css";
import e from "./effectif.module.css";

const fr0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fr1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${fr1.format(v * 100)} %`;
const dateLongue = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const signe = (n: number) => (n > 0 ? `+${fr0.format(n)}` : fr0.format(n));

/** Hex → couleur de la fonction (stable) : même teinte pour une même fonction. */
const TEINTES = ["#38bdf8", "#10b981", "#f59e0b", "#f472b6", "#c084fc", "#818cf8", "#fb923c", "#06b6d4", "#a3e635", "#f87171", "#2dd4bf", "#e879f9", "#94a3b8"];

function NomAgent({ a }: { a: Agent }) {
  return <><strong>{a.nom}</strong> {a.prenom}</>;
}
function NomListe({ nom }: { nom: string }) {
  return (
    <>
      {nom.split(" ").map((t, i) =>
        /^[\p{Lu}’'-]{2,}$/u.test(t) ? <strong key={i}>{t} </strong> : <span key={i}>{t} </span>
      )}
    </>
  );
}

/* ---------- Pôles et indicateurs ---------- */

function Poles({ agents, choisi, onChoix }: { agents: Agent[]; choisi: string | null; onChoix: (p: string | null) => void }) {
  const g = useMemo(() => agreger(agents), [agents]);
  return (
    <div className={e.poles} role="group" aria-label="Filtrer par pôle">
      <button type="button" className={e.poleBouton} aria-pressed={choisi === null}
        style={{ ["--accent" as string]: "#e8eef7" }} onClick={() => onChoix(null)}>
        <div className={e.poleValeur}>{fr0.format(g.total)}</div>
        <div className={e.poleLibelle}>Toute la société</div>
        <div className={e.poleNote}>{fr0.format(g.nbServices)} centres de frais</div>
      </button>
      {g.poles.map((p) => (
        <button key={p.pole} type="button" className={e.poleBouton} aria-pressed={choisi === p.pole}
          style={{ ["--accent" as string]: COULEUR_POLE[p.pole] }} onClick={() => onChoix(choisi === p.pole ? null : p.pole)}>
          <div className={e.poleValeur}>{fr0.format(p.n)}</div>
          <div className={e.poleLibelle}>{p.pole}</div>
          <div className={e.poleNote}>{pct(p.part)} de l’effectif</div>
        </button>
      ))}
    </div>
  );
}

function Fonctions({ agents, pole }: { agents: Agent[]; pole: string | null }) {
  const g = useMemo(() => agreger(agents, pole), [agents, pole]);
  const couleur = pole ? COULEUR_POLE[pole] : "#38bdf8";
  const max = Math.max(1, ...g.fonctions.map((f) => f.n));
  return (
    <section className={`dashboard-card ${s.bloc}`} aria-labelledby="eff-fonctions">
      <h3 id="eff-fonctions" className={s.blocTitre}>Répartition par fonction</h3>
      <p className={s.note} style={{ marginTop: -8, marginBottom: 12 }}>
        {pole ? <>{pole} : {fr0.format(g.total)} agents.</> : <>Toute la société : {fr0.format(g.total)} agents.</>}
      </p>
      <div className={s.barres}>
        {g.fonctions.map((f, i) => (
          <div key={f.libelle} className={s.barre}>
            <span className={s.barreLibelle}><i className={s.pastille} style={{ background: pole ? couleur : TEINTES[i % TEINTES.length] }} aria-hidden="true" />{f.libelle}</span>
            <span className={s.piste}>
              <span className={s.remplissage} style={{ width: `${(f.n / max) * 100}%`, background: pole ? couleur : TEINTES[i % TEINTES.length] }} />
            </span>
            <span className={s.barreValeur}>{fr0.format(f.n)} <small>{pct(f.part)}</small></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CentresDeFrais({ agents, pole }: { agents: Agent[]; pole: string | null }) {
  const g = useMemo(() => agreger(agents, pole), [agents, pole]);
  const couleur = pole ? COULEUR_POLE[pole] : "#38bdf8";
  const max = Math.max(1, ...g.services.map((x) => x.n));
  return (
    <section className={`dashboard-card ${s.bloc}`} aria-labelledby="eff-services">
      <h3 id="eff-services" className={s.blocTitre}>Effectif par centre de frais</h3>
      <p className={s.note} style={{ marginTop: -8, marginBottom: 12 }}>{fr0.format(g.services.length)} centres de frais{pole ? ` dans ce pôle` : ""}, du plus grand au plus petit.</p>
      <div className={`${s.barres} ${e.defile}`} tabIndex={0} aria-label="Liste défilante des centres de frais">
        {g.services.map((x) => (
          <div key={x.cf} className={s.barre}>
            <span className={s.barreLibelle} title={x.service}><span className={e.code}>{x.cf}</span>{x.service}</span>
            <span className={s.piste}><span className={s.remplissage} style={{ width: `${(x.n / max) * 100}%`, background: couleur }} /></span>
            <span className={s.barreValeur}>{fr0.format(x.n)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Rapprochement avec la liste des centres ---------- */

function CarteCouples({ titre, n, pourquoi, action, couples, prio }: {
  titre: string; n: number; pourquoi: string; action: string; prio: "haute" | "moyenne"; couples: Couple[];
}) {
  return (
    <article className={`${s.verifCarte} ${prio === "haute" ? s.prioHaute : s.prioMoyenne}`}>
      <header className={s.verifEntete}>
        <span className={s.verifN} aria-label={`${n} concerné${n > 1 ? "s" : ""}`}>{n}</span>
        <div><h4>{titre}</h4><span className={s.prio}>{prio === "haute" ? "Priorité haute" : "Priorité moyenne"}</span></div>
      </header>
      <p className={s.pourquoi}>{pourquoi}</p>
      <div>
        {couples.map(({ p, agent }) => (
          <div key={p.rang} className={e.coupleLigne}>
            <div className={e.coupleCol}>
              <div className={e.coupleEtiquette}>Liste des centres</div>
              <div className={e.coupleNom}><NomListe nom={p.nom} /></div>
              <div className={e.coupleLieu}>{p.estStaffDr ? `DR ${p.dr}` : `${p.centre}, DR ${p.dr}`} · Mle {p.matricule}</div>
            </div>
            <span className={e.fleche} aria-hidden="true"><ArrowRightLeft size={14} /></span>
            <div className={e.coupleCol}>
              <div className={e.coupleEtiquette}>Liste du personnel</div>
              <div className={e.coupleNom}><NomAgent a={agent} /></div>
              <div className={e.coupleLieu}>{agent.service} · Mle {agent.matricule}</div>
            </div>
          </div>
        ))}
      </div>
      <p className={s.action}><strong>À faire :</strong> {action}</p>
    </article>
  );
}

function LigneCouple({ p, agent }: Couple) {
  return (
    <div className={e.coupleLigne}>
      <div className={e.coupleCol}>
        <div className={e.coupleEtiquette}>Liste des centres</div>
        <div className={e.coupleNom}><NomListe nom={p.nom} /></div>
        <div className={e.coupleLieu}>{p.estStaffDr ? `DR ${p.dr}` : `${p.centre}, DR ${p.dr}`} · Mle {p.matricule}</div>
      </div>
      <span className={e.fleche} aria-hidden="true"><ArrowRightLeft size={14} /></span>
      <div className={e.coupleCol}>
        <div className={e.coupleEtiquette}>Liste du personnel</div>
        <div className={e.coupleNom}><NomAgent a={agent} /></div>
        <div className={e.coupleLieu}>{agent.service} · Mle {agent.matricule}</div>
      </div>
    </div>
  );
}

function CarteConcordants({ couples, total }: { couples: Couple[]; total: number }) {
  const [ouvert, setOuvert] = useState(false);
  const groupes = useMemo(() => {
    const m = new Map<string, Couple[]>();
    for (const c of [...couples].sort((a, b) => a.p.rang - b.p.rang)) m.set(c.p.dr, [...(m.get(c.p.dr) ?? []), c]);
    return [...m.entries()];
  }, [couples]);
  return (
    <article className={`${s.verifCarte} ${s.prioOk} ${e.carteLarge}`}>
      <header className={e.carteEntete}>
        <div className={s.verifEntete}>
          <span className={s.verifN} aria-label={`${couples.length} agents`}>{couples.length}</span>
          <div>
            <h4>Matricule et nom identiques dans les deux listes</h4>
            <span className={s.prio}>Confirmés : {fr0.format(couples.length)} agents sur {fr0.format(total)}, soit {pct(total ? couples.length / total : 0)}</span>
          </div>
        </div>
        <button type="button" className={e.basculer} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Tout replier" : "Tout déplier"}
        </button>
      </header>
      <p className={s.pourquoi}>
        Ces agents de la liste des centres sont retrouvés dans la liste du personnel de la société avec le même matricule et le même nom.
        Leur identité est confirmée ; seule leur affectation peut encore être à vérifier.
      </p>
      <div key={String(ouvert)}>
        {groupes.map(([dr, l]) => (
          <details key={dr} className={e.groupe} open={ouvert}>
            <summary>Direction régionale de {dr}<span className={e.groupeN}>{l.length} agent{l.length > 1 ? "s" : ""}</span></summary>
            <div className={e.coupleGrille}>
              {l.map((c) => <LigneCouple key={c.p.rang} p={c.p} agent={c.agent} />)}
            </div>
          </details>
        ))}
      </div>
      <p className={s.action}><strong>À faire :</strong> Rien pour l’identité de ces agents. Vérifier seulement ceux dont l’affectation diffère (carte « Affectation différente »).</p>
    </article>
  );
}

function Rapprochement({ agents, centres, dateListe }: { agents: Agent[]; centres: Personne[]; dateListe: string | null }) {
  const r = useMemo(() => rapprocher(agents, centres), [agents, centres]);
  if (!centres.length) return null;
  const ecartTotal = r.totalPaie - r.totalListe;
  const siege = agents.filter((a) => a.cf === "0700").length;
  return (
    <NewFeatureBubble id="rh-rapprochement-2026-11-v2" block title="Comparaison corrigée"
      lines={["Les régions suivent désormais la même géographie dans les deux listes, et un agent n’est confirmé que si son nom de famille correspond.",
        "Retrouvés et non retrouvés font maintenant exactement le total de la liste des centres."]}>
      <section className={`dashboard-card ${s.bloc}`} aria-labelledby="eff-rapp">
        <div className={s.blocEntete}>
          <h3 id="eff-rapp" className={s.blocTitre}>Comparaison avec la liste des centres de l’intérieur</h3>
          <span className={s.note}>Les agents sont rapprochés par matricule{dateListe ? `, liste des centres du ${dateLongue(dateListe)}` : ""}.</span>
        </div>

        <div className={e.synthese}>
          <div className={e.chiffre}><b>{fr0.format(r.totalPaie)}</b><span>agents de l’intérieur dans la liste du personnel (centres et directions régionales)</span></div>
          <div className={e.chiffre}><b>{fr0.format(r.totalListe)}</b><span>agents dans la liste des centres de l’intérieur, soit {fr0.format(Math.abs(ecartTotal))} de {ecartTotal >= 0 ? "moins" : "plus"}</span></div>
          <div className={e.chiffre} style={{ ["--accent" as string]: "#34d399" }}><b>{fr0.format(r.retrouves.length)}</b><span>agents de la liste des centres retrouvés avec le même matricule et le même nom de famille{r.affectationDifferente.length > 0 ? `, dont ${fr0.format(r.affectationDifferente.length)} affectés ailleurs` : ""}</span></div>
          <div className={`${e.chiffre} ${e.chiffreAlerte}`}><b>{fr0.format(r.nbNonRetrouves)}</b><span>agents de la liste des centres non retrouvés : matricule ou nom à vérifier, détaillés plus bas</span></div>
        </div>

        <div className={e.regionsEtCartes}>
          <div className={e.tableauScroll}>
            <table className={e.tableau}>
              <caption>Effectif par région : liste des centres et liste du personnel</caption>
              <thead>
                <tr><th scope="col">Région</th><th scope="col">Liste des centres</th><th scope="col">Liste du personnel</th><th scope="col">Écart</th></tr>
              </thead>
              <tbody>
                {r.regions.map((x) => (
                  <tr key={x.code}>
                    <td>{x.region}</td><td>{fr0.format(x.liste)}</td><td>{fr0.format(x.paie)}</td>
                    <td className={x.ecart === 0 ? e.ecartNul : e.ecartPlus}>{signe(x.ecart)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td><td>{fr0.format(r.totalListe)}</td><td>{fr0.format(r.totalPaie)}</td><td className={ecartTotal === 0 ? e.ecartNul : e.ecartPlus}>{signe(ecartTotal)}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className={s.note}>
            Dans les deux listes, chaque centre est rangé dans la région de son centre de frais : Koundara et Gaoual en Moyenne Guinée,
            Dabola et Dinguiraye en Haute Guinée, même quand la liste des centres les place sous la DR Boké ou la DR Faranah. Le personnel
            des directions régionales est rangé dans la région de sa DR. L’écart indique quelle liste est la plus longue ; il reste à confirmer avec la DCCCI et la DRH laquelle est à jour.
            Les {fr0.format(siege)} agents du siège de la direction de la clientèle de l’intérieur ne sont pas comptés.
          </p>

          <div className={s.verifGrille}>
            {r.retrouves.length > 0 && <CarteConcordants couples={r.retrouves} total={r.nbListe} />}
            {r.nomDifferent.length > 0 && (
              <CarteCouples prio="haute" titre="Matricule connu, nom différent" n={r.nomDifferent.length} couples={r.nomDifferent}
                pourquoi="Le matricule de la liste des centres appartient, dans la liste du personnel, à une autre personne ou à un agent au nom de famille différent."
                action="Faire vérifier le matricule de chaque agent par la DCCCI et la DRH." />
            )}
            {r.affectationDifferente.length > 0 && (
              <CarteCouples prio="moyenne" titre="Affectation différente" n={r.affectationDifferente.length} couples={r.affectationDifferente}
                pourquoi="Même agent dans les deux listes, mais rattaché à un autre centre ou à une autre direction régionale."
                action="Confirmer le centre où l’agent travaille réellement." />
            )}
            {r.absentsPaie.length > 0 && (
              <article className={`${s.verifCarte} ${s.prioMoyenne}`}>
                <header className={s.verifEntete}>
                  <span className={s.verifN}>{r.absentsPaie.length}</span>
                  <div><h4>Absents de la liste du personnel</h4><span className={s.prio}>Priorité moyenne</span></div>
                </header>
                <p className={s.pourquoi}>Agents de la liste des centres dont le matricule est absent de la liste du personnel, ou non renseigné.</p>
                <ul className={s.verifListe}>
                  {r.absentsPaie.map((p) => (
                    <li key={p.rang} className={s.verifLigne}>
                      <div className={s.personneCorps}>
                        <div className={s.personneNom}><NomListe nom={p.nom} /></div>
                        <div className={s.personneMeta}>{p.fonction} · {p.estStaffDr ? `DR ${p.dr}` : `${p.centre}, DR ${p.dr}`}</div>
                      </div>
                      <span className={`${s.valeur} ${p.matricule ? "" : s.valeurVide}`}>{p.matricule ? `Mle ${p.matricule}` : "non renseigné"}</span>
                    </li>
                  ))}
                </ul>
                <p className={s.action}><strong>À faire :</strong> Vérifier le matricule, ou confirmer que l’agent a quitté la société.</p>
              </article>
            )}
          </div>

          <details className={s.equipe}>
            <summary>Détail centre par centre ({r.parCentre.length} centres)</summary>
            <div className={e.tableauScroll}>
              <table className={e.tableau}>
                <thead><tr><th scope="col">Centre</th><th scope="col">Liste des centres</th><th scope="col">Liste du personnel</th><th scope="col">Écart</th></tr></thead>
                <tbody>
                  {r.parCentre.map((x) => (
                    <tr key={x.centre}>
                      <td>{x.centre}</td><td>{fr0.format(x.liste)}</td><td>{fr0.format(x.paie)}</td>
                      <td className={x.ecart === 0 ? e.ecartNul : e.ecartPlus}>{signe(x.ecart)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={s.note}>Hors personnel des directions régionales : dans la liste du personnel, les agents installés au siège d’une direction régionale sont rattachés à leur centre.</p>
          </details>
        </div>
      </section>
    </NewFeatureBubble>
  );
}

/* ---------- Qualité de la liste du personnel ---------- */

function Qualite({ agents }: { agents: Agent[] }) {
  const v = useMemo(() => verifierEffectif(agents), [agents]);
  if (!v.alertes.length && !v.anciens.length) return null;
  return (
    <section className={`dashboard-card ${s.bloc}`} aria-labelledby="eff-qualite">
      <div className={s.blocEntete}>
        <h3 id="eff-qualite" className={s.blocTitre}>Points à faire confirmer dans la liste du personnel</h3>
        <span className={s.note}>Valeurs affichées telles que transmises.</span>
      </div>
      <div className={s.verifGrille}>
        {v.alertes.length > 0 && (
          <article className={`${s.verifCarte} ${s.prioMoyenne}`}>
            <header className={s.verifEntete}>
              <span className={s.verifN}>{v.alertes.length}</span>
              <div><h4>Noms ou matricules à vérifier</h4><span className={s.prio}>Priorité moyenne</span></div>
            </header>
            <p className={s.pourquoi}>Noms qui se terminent par un tiret, prénoms contenant un chiffre, matricules hors de la numérotation habituelle.</p>
            <ul className={s.verifListe}>
              {v.alertes.map((a) => (
                <li key={a.rang} className={s.verifLigne}>
                  <div className={s.personneCorps}>
                    <div className={s.personneNom}><NomAgent a={a} /></div>
                    <div className={s.personneMeta}>{a.emploi.toLowerCase()} · {a.service}</div>
                  </div>
                  <span className={s.valeur}>Mle {a.matricule}</span>
                </li>
              ))}
            </ul>
            <p className={s.action}><strong>À faire :</strong> Demander à la DRH de corriger ces fiches.</p>
          </article>
        )}
        {v.anciens.length > 0 && (
          <article className={`${s.verifCarte} ${s.prioFaible}`}>
            <header className={s.verifEntete}>
              <span className={s.verifN}>{v.anciens.length}</span>
              <div><h4>Emplois libellés « ancien » ou « ex »</h4><span className={s.prio}>Priorité faible</span></div>
            </header>
            <p className={s.pourquoi}>Ces agents figurent dans la liste du personnel avec un emploi précédé de « ancien » ou « ex ».</p>
            <ul className={s.verifListe}>
              {v.anciens.map((a) => (
                <li key={a.rang} className={s.verifLigne}>
                  <div className={s.personneCorps}>
                    <div className={s.personneNom}><NomAgent a={a} /></div>
                    <div className={s.personneMeta}>{a.service}</div>
                  </div>
                  <span className={s.valeur}>{a.emploi.toLowerCase()}</span>
                </li>
              ))}
            </ul>
            <p className={s.action}><strong>À faire :</strong> Faire confirmer l’emploi actuel de chaque agent.</p>
          </article>
        )}
      </div>
    </section>
  );
}

/* ---------- Vue complète ---------- */

export default function EffectifSociete({ agents, centres, dateReception, dateListeCentres, source }: {
  agents: Agent[]; centres: Personne[]; dateReception: string | null; dateListeCentres: string | null; source: string | null;
}) {
  const [pole, setPole] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const total = agents.length;
  const nbServices = useMemo(() => new Set(agents.map((a) => a.cf)).size, [agents]);

  const recherche = q.trim().toLowerCase();
  const trouves = useMemo(() => {
    if (recherche.length < 2) return [];
    return agents.filter((a) => `${a.nom} ${a.prenom} ${a.matricule} ${a.emploi} ${a.service} ${a.cf}`.toLowerCase().includes(recherche));
  }, [agents, recherche]);

  if (!total) return null;

  return (
    <div className={s.racine}>
      <NewFeatureBubble id="rh-effectif-2026-11" block title="Effectif de toute la société"
        lines={[`Nouvelle liste du personnel : ${fr0.format(total)} agents, tous services confondus.`, "Répartition par pôle, par fonction et par centre de frais."]}>
        <header className={s.hero}>
          <div>
            <div className={s.eyebrow}>Direction Générale · Ressources humaines</div>
            <h2 className={s.titre}><Users size={24} aria-hidden="true" /> Effectif de la société</h2>
            <p className={s.sousTitre}>
              {fr0.format(total)} agents dans {fr0.format(nbServices)} centres de frais, d’après la liste du personnel par centre de frais
              {dateReception ? ` reçue le ${dateLongue(dateReception)}` : ""}.
            </p>
          </div>
          <label className={s.recherche}>
            <Search size={16} aria-hidden="true" />
            <span className={s.sr}>Rechercher un agent dans toute la société</span>
            <input type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Rechercher un agent, un matricule, un service…" />
          </label>
        </header>
      </NewFeatureBubble>

      {recherche.length >= 2 ? (
        <section className={`dashboard-card ${s.bloc}`} aria-live="polite">
          <div className={s.blocEntete}>
            <h3 className={s.blocTitre}>Résultats de la recherche</h3>
            <span className={s.note}>{fr0.format(trouves.length)} résultat{trouves.length > 1 ? "s" : ""}{trouves.length > 60 ? ", les 60 premiers sont affichés" : ""}</span>
          </div>
          {trouves.length === 0 ? <p className={s.note}>Aucun agent ne correspond à « {q} ».</p> : (
            <ul className={e.rechercheListe}>
              {trouves.slice(0, 60).map((a) => (
                <li key={a.rang} className={e.resultat}>
                  <span><NomAgent a={a} /></span>
                  <span className={e.resultatMeta}>{a.emploi.toLowerCase()} · {a.service} · Mle {a.matricule}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <Poles agents={agents} choisi={pole} onChoix={setPole} />
          <div className={s.deux}>
            <Fonctions agents={agents} pole={pole} />
            <CentresDeFrais agents={agents} pole={pole} />
          </div>
          <Rapprochement agents={agents} centres={centres} dateListe={dateListeCentres} />
          <Qualite agents={agents} />
        </>
      )}

      <p className={s.pied}>
        <Building2 size={12} aria-hidden="true" style={{ verticalAlign: -1, marginRight: 6 }} />
        Source : {source ?? "liste du personnel par centre de frais"}. Les emplois sont regroupés sous {fr0.format(new Set(agents.map((a) => a.categorie)).size)} fonctions pour les statistiques ;
        les pôles regroupent les centres de frais par code.
        <ShieldCheck size={12} aria-hidden="true" style={{ verticalAlign: -1, margin: "0 6px 0 10px" }} />
        Données personnelles : accès réservé.
      </p>
    </div>
  );
}
