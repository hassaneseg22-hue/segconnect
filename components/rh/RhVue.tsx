"use client";
// components/rh/RhVue.tsx
// Page Ressources humaines du DG : personnel des centres de l'intérieur.
import { useMemo, useState } from "react";
import { Users, Building2, UserCheck, Phone, Search, AlertTriangle, ShieldCheck, Wrench } from "lucide-react";
import { NewFeatureBubble } from "@/components/NewFeatureBubble";
import {
  agreger, verifier, COULEUR, LIBELLE, ORDRE_CATEGORIES,
  type Personne, type Centre, type Direction, type Categorie, type GroupeVerif, type Priorite,
} from "@/lib/rh-agregat";
import type { Controle } from "@/lib/rh-effectif";
import s from "./rh.module.css";

const fr0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fr1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${fr1.format(v * 100)} %`;
const dateLongue = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const accord = (n: number, c: Categorie) => `${fr0.format(n)} ${LIBELLE[c][n > 1 ? 1 : 0]}`;

/* ---------- Petits composants ---------- */

function Nom({ nom }: { nom: string }) {
  return (
    <>
      {nom.split(" ").map((t, i) =>
        /^[\p{Lu}’'-]{2,}$/u.test(t) ? <strong key={i}>{t} </strong> : <span key={i}>{t} </span>
      )}
    </>
  );
}

function Initiales({ nom, couleur }: { nom: string; couleur: string }) {
  const t = nom.split(" ").filter(Boolean);
  const nomFamille = t.find((x) => /^[\p{Lu}’'-]{2,}$/u.test(x)) ?? t[t.length - 1];
  const ini = ((t[0]?.[0] ?? "") + (nomFamille?.[0] ?? "")).toUpperCase();
  return (
    <span className={s.avatar} style={{ background: couleur + "26", color: couleur, borderColor: couleur + "55" }} aria-hidden="true">
      {ini}
    </span>
  );
}

function Tel({ contact }: { contact: string | null }) {
  if (!contact) return <span className={s.manque}>Contact non renseigné</span>;
  const chiffres = contact.replace(/\s/g, "");
  const contenu = (<><Phone size={12} aria-hidden="true" />{contact}</>);
  return /^\d{9}$/.test(chiffres)
    ? <a className={s.tel} href={`tel:+224${chiffres}`}>{contenu}</a>
    : <span className={s.tel}>{contenu}</span>;
}

function Pastille({ categorie }: { categorie: Categorie }) {
  return <i className={s.pastille} style={{ background: COULEUR[categorie] }} aria-hidden="true" />;
}

function Ligne({ p, avecLieu = false }: { p: Personne; avecLieu?: boolean }) {
  return (
    <li className={s.personne}>
      <Initiales nom={p.nom} couleur={COULEUR[p.categorie]} />
      <div className={s.personneCorps}>
        <div className={s.personneNom}>
          <Nom nom={p.nom} />
          {p.alerte && <AlertTriangle size={13} className={s.alerteIcone} aria-label="Valeur à vérifier" />}
        </div>
        <div className={s.personneMeta}>
          <span style={{ color: COULEUR[p.categorie] }}>{p.fonction}</span>
          {avecLieu && <span> · {p.centre === "Direction régionale" ? `DR ${p.dr}` : `${p.centre} (DR ${p.dr})`}</span>}
          {p.matricule && <span> · Mle {p.matricule}</span>}
        </div>
      </div>
      <Tel contact={p.contact} />
    </li>
  );
}

/* ---------- Sections ---------- */

function Indicateurs({ a }: { a: ReturnType<typeof agreger> }) {
  const cartes = [
    { icone: <Users size={18} />, valeur: fr0.format(a.total), libelle: "Agents dans la liste", note: "Centres de l’intérieur", couleur: "#38bdf8" },
    { icone: <Building2 size={18} />, valeur: fr0.format(a.enCentres), libelle: "Agents en centre", note: `${a.nbCentres} centres, ${fr1.format(a.moyenneParCentre)} agents en moyenne`, couleur: "#10b981" },
    { icone: <UserCheck size={18} />, valeur: fr0.format(a.enDr), libelle: "En direction régionale", note: `${a.nbDr} directions régionales`, couleur: "#c084fc" },
    { icone: <Wrench size={18} />, valeur: fr0.format(a.fonctions.find((f) => f.categorie === "Plombier")?.n ?? 0), libelle: "Plombiers", note: `Présents dans ${a.nbCentres - a.vigilance.sansPlombier.length} centres sur ${a.nbCentres}`, couleur: "#f472b6" },
    { icone: <ShieldCheck size={18} />, valeur: fr0.format(a.vigilance.petitsEffectifs.length + a.vigilance.sansChef.length), libelle: "Centres à surveiller", note: "Effectif réduit ou sans chef", couleur: "#f59e0b" },
  ];
  return (
    <div className={s.kpis}>
      {cartes.map((c) => (
        <div key={c.libelle} className={`dashboard-card ${s.kpi}`} style={{ ["--accent" as string]: c.couleur }}>
          <span className={s.kpiIcone}>{c.icone}</span>
          <div className={s.kpiValeur}>{c.valeur}</div>
          <div className={s.kpiLibelle}>{c.libelle}</div>
          <div className={s.kpiNote}>{c.note}</div>
        </div>
      ))}
    </div>
  );
}

function Fonctions({ a }: { a: ReturnType<typeof agreger> }) {
  const max = Math.max(1, ...a.fonctions.map((f) => f.n));
  return (
    <section className={`dashboard-card ${s.bloc}`} aria-labelledby="rh-fonctions">
      <h3 id="rh-fonctions" className={s.blocTitre}>Répartition par fonction</h3>
      <div className={s.barres}>
        {a.fonctions.map((f) => (
          <div key={f.categorie} className={s.barre}>
            <span className={s.barreLibelle}><Pastille categorie={f.categorie} />{f.categorie}</span>
            <span className={s.piste}>
              <span className={s.remplissage} style={{ width: `${(f.n / max) * 100}%`, background: COULEUR[f.categorie] }} />
            </span>
            <span className={s.barreValeur}>{fr0.format(f.n)} <small>{pct(f.part)}</small></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ParDirection({ a, choisie, onChoix }: { a: ReturnType<typeof agreger>; choisie: string; onChoix: (dr: string) => void }) {
  const max = Math.max(1, ...a.directions.map((d) => d.total));
  return (
    <section className={`dashboard-card ${s.bloc}`} aria-labelledby="rh-dr">
      <h3 id="rh-dr" className={s.blocTitre}>Effectif par direction régionale</h3>
      <div className={s.legende}>
        <span><i className={s.pastille} style={{ background: "#c084fc" }} />Direction régionale</span>
        <span><i className={s.pastille} style={{ background: "#38bdf8" }} />Centres</span>
      </div>
      <div className={s.barres}>
        {a.directions.map((d) => {
          const centres = d.total - (d.staff.length + (d.directeur ? 1 : 0));
          const dirN = d.total - centres;
          return (
            <button key={d.dr} type="button" className={`${s.barre} ${s.barreBouton}`} aria-pressed={choisie === d.dr}
              onClick={() => { onChoix(d.dr); document.getElementById("rh-annuaire")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              <span className={s.barreLibelle}>{d.dr}</span>
              <span className={s.piste}>
                <span className={s.remplissage} style={{ width: `${(dirN / max) * 100}%`, background: "#c084fc", borderRadius: "5px 0 0 5px" }} />
                <span className={s.remplissage} style={{ width: `${(centres / max) * 100}%`, background: "#38bdf8", borderRadius: "0 5px 5px 0" }} />
              </span>
              <span className={s.barreValeur}>{fr0.format(d.total)} <small>{d.centres.length} centres</small></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Vigilance({ a }: { a: ReturnType<typeof agreger> }) {
  const v = a.vigilance;
  const noms = (l: Centre[]) => l.map((c) => c.nom).join(", ");
  const tuiles: { titre: string; n: number; texte: string; ton: "alerte" | "info" }[] = [
    { titre: "Effectif très réduit", n: v.petitsEffectifs.length, ton: "alerte",
      texte: v.petitsEffectifs.map((c) => `${c.nom} (${c.effectif})`).join(", ") || "Aucun centre" },
    { titre: "Sans chef de centre", n: v.sansChef.length, ton: "alerte",
      texte: noms(v.sansChef) || "Tous les centres ont un chef" },
    { titre: "Sans plombier", n: v.sansPlombier.length, ton: "alerte", texte: noms(v.sansPlombier) || "Aucun centre" },
    { titre: "Sans agent de zone", n: v.sansAgentZone.length, ton: "info", texte: noms(v.sansAgentZone) || "Aucun centre" },
    { titre: "Sans agent de station", n: v.sansAgentStation.length, ton: "info", texte: noms(v.sansAgentStation) || "Aucun centre" },
    { titre: "Caissier(ère) en centre", n: v.avecCaisse.length, ton: "info",
      texte: `${noms(v.avecCaisse) || "Aucun centre"}. ${v.avecFacturier.length === 0 ? "Aucun facturier n’apparaît dans les centres." : ""}` },
  ];
  return (
    <section className={`dashboard-card ${s.bloc}`} aria-labelledby="rh-vigilance">
      <div className={s.blocEntete}>
        <h3 id="rh-vigilance" className={s.blocTitre}>Points d’attention</h3>
        <span className={s.note}>Calculés à partir de la liste transmise, centre par centre.</span>
      </div>
      <div className={s.tuiles}>
        {tuiles.map((t) => (
          <div key={t.titre} className={`${s.tuile} ${t.ton === "alerte" ? s.tuileAlerte : ""}`}>
            <div className={s.tuileN}>{fr0.format(t.n)}</div>
            <div>
              <div className={s.tuileTitre}>{t.titre}</div>
              <div className={s.tuileTexte}>{t.texte}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CarteCentre({ c }: { c: Centre }) {
  const autres = ORDRE_CATEGORIES.filter((k) => k !== "Chef de centre" && c.composition[k]);
  return (
    <article className={`${s.centre} ${c.effectif <= 2 ? s.centreFaible : ""}`}>
      <header className={s.centreEntete}>
        <h4>{c.nom}</h4>
        <span className={s.effectif}>{fr0.format(c.effectif)} agent{c.effectif > 1 ? "s" : ""}</span>
      </header>
      {c.chef ? (
        <div className={s.chef}>
          <Initiales nom={c.chef.nom} couleur={COULEUR["Chef de centre"]} />
          <div className={s.personneCorps}>
            <div className={s.personneNom}><Nom nom={c.chef.nom} /></div>
            <div className={s.personneMeta} style={{ color: COULEUR["Chef de centre"] }}>{c.chef.fonction}</div>
          </div>
          <Tel contact={c.chef.contact} />
        </div>
      ) : (
        <p className={s.sansChef}><AlertTriangle size={13} aria-hidden="true" /> Aucun chef de centre dans la liste</p>
      )}
      <div className={s.puces}>
        {autres.map((k) => (
          <span key={k} className={s.puce} style={{ borderColor: COULEUR[k] + "66", color: COULEUR[k] }}>
            {accord(c.composition[k] ?? 0, k)}
          </span>
        ))}
      </div>
      <details className={s.equipe}>
        <summary>Voir l’équipe</summary>
        <ul className={s.liste}>{c.membres.map((m) => <Ligne key={m.rang} p={m} />)}</ul>
      </details>
    </article>
  );
}

function BlocDirection({ d }: { d: Direction }) {
  return (
    <div className={s.direction}>
      <div className={s.directionTete}>
        <div>
          <div className={s.eyebrow}>Direction régionale</div>
          <h3 className={s.directionNom}>{d.dr}</h3>
          <p className={s.note}>{fr0.format(d.total)} agents, {d.centres.length} centres : {d.centres.map((c) => c.nom).join(", ")}.</p>
        </div>
        {d.directeur && (
          <div className={s.directeur}>
            <Initiales nom={d.directeur.nom} couleur={COULEUR["Directeur régional"]} />
            <div className={s.personneCorps}>
              <div className={s.personneNom}><Nom nom={d.directeur.nom} /></div>
              <div className={s.personneMeta} style={{ color: COULEUR["Directeur régional"] }}>
                {d.directeur.fonction}{d.directeur.matricule ? ` · Mle ${d.directeur.matricule}` : ""}
              </div>
            </div>
            <Tel contact={d.directeur.contact} />
          </div>
        )}
      </div>
      {d.staff.length > 0 && (
        <details className={s.equipe} open>
          <summary>Personnel de la direction régionale ({d.staff.length})</summary>
          <ul className={`${s.liste} ${s.listeDouble}`}>{d.staff.map((m) => <Ligne key={m.rang} p={m} />)}</ul>
        </details>
      )}
      <div className={s.grille}>{d.centres.map((c) => <CarteCentre key={c.nom} c={c} />)}</div>
    </div>
  );
}

/* ---------- Qualité de la liste transmise ---------- */

const PRIORITE: Record<Priorite, { libelle: string; classe: string }> = {
  haute: { libelle: "Priorité haute", classe: s.prioHaute },
  moyenne: { libelle: "Priorité moyenne", classe: s.prioMoyenne },
  faible: { libelle: "Priorité faible", classe: s.prioFaible },
};
const lieu = (p: Personne) => (p.estStaffDr ? `Direction régionale de ${p.dr}` : `${p.centre}, DR ${p.dr}`);

function ControleMatricules({ c }: { c: Controle }) {
  const part = c.total ? c.concordent / c.total : 0;
  return (
    <div className={s.controle}>
      <div className={s.controleHaut}>
        <div className={s.controleGrand}>{fr0.format(c.concordent)}<small>sur {fr0.format(c.total)}</small></div>
        <div className={s.controleTexte}>
          <strong>agents de la liste des centres retrouvés avec le même matricule et le même nom</strong> dans la liste du personnel de la société.
          <div className={s.piste} role="img" aria-label={`${c.concordent} agents confirmés sur ${c.total}`}>
            <span className={s.remplissage} style={{ width: `${part * 100}%`, background: "#10b981", borderRadius: "5px 0 0 5px" }} />
          </div>
          <span className={s.note}>{pct(part)} des matricules sont confirmés ; les {fr0.format(c.total - c.concordent)} autres sont signalés ci-dessous ou dans la comparaison des deux listes.</span>
        </div>
      </div>
      <div className={s.controleDr}>
        {c.parDr.map((d) => (
          <span key={d.dr} className={`${s.controlePuce} ${d.concordent === d.total ? s.controleOk : ""}`}>
            {d.dr} <b>{d.concordent}/{d.total}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Etat({ c, p }: { c?: Controle; p: Personne }) {
  const e = c?.statut[p.rang];
  if (!e) return null;
  if (e.etat === "concorde") return <span className={`${s.etat} ${s.etatOk}`}><ShieldCheck size={12} aria-hidden="true" />Confirmé par la liste du personnel</span>;
  if (e.etat === "autre" && e.agent) return <span className={`${s.etat} ${s.etatAlerte}`}>Ce matricule est celui de {e.agent.nom} {e.agent.prenom} ({e.agent.service})</span>;
  return <span className={`${s.etat} ${s.etatAlerte}`}>Absent de la liste du personnel</span>;
}

function CarteVerif({ g, controle }: { g: GroupeVerif; controle?: Controle }) {
  const pr = PRIORITE[g.priorite];
  const n = g.cle === "rang-manquant" ? g.elements.length : g.nbAgents;
  return (
    <article className={`${s.verifCarte} ${pr.classe}`}>
      <header className={s.verifEntete}>
        <span className={s.verifN} aria-label={`${n} concerné${n > 1 ? "s" : ""}`}>{n}</span>
        <div>
          <h4>{g.titre}</h4>
          <span className={s.prio}>{pr.libelle}</span>
        </div>
      </header>
      <p className={s.pourquoi}>{g.pourquoi}</p>
      {g.remarque && <p className={s.remarque}>{g.remarque}</p>}
      {g.cle === "matricule-double" && controle && controle.total > 0 && <ControleMatricules c={controle} />}
      <ul className={s.verifListe}>
        {g.elements.map((e, i) => (
          <li key={i} className={e.lignes.length > 1 || e.titre ? s.verifGroupe : undefined}>
            {e.titre && <div className={s.elementTitre}>{e.titre}</div>}
            {e.detail && <div className={s.note}>{e.detail}</div>}
            {e.lignes.map(({ p, valeur }) => (
              <div key={p.rang} className={s.verifLigne}>
                <div className={s.personneCorps}>
                  <div className={s.personneNom}><Nom nom={p.nom} /></div>
                  <div className={s.personneMeta}>
                    <span style={{ color: COULEUR[p.categorie] }}>{p.fonction}</span> · {lieu(p)}
                  </div>
                  {g.cle === "matricule-double" && <Etat c={controle} p={p} />}
                </div>
                {valeur && <span className={`${s.valeur} ${valeur === "non renseigné" ? s.valeurVide : ""}`}>{valeur}</span>}
              </div>
            ))}
          </li>
        ))}
      </ul>
      <p className={s.action}><strong>À faire :</strong> {g.action}</p>
    </article>
  );
}

function Verifications({ v, total, controle }: { v: ReturnType<typeof verifier>; total: number; controle?: Controle }) {
  const n = v.agentsConcernes;
  const sans = total - n;
  const maxDr = Math.max(1, ...v.parDr.map((d) => d.total));
  if (v.groupes.length === 0) {
    return (
      <section className={`dashboard-card ${s.bloc}`}>
        <h3 className={s.blocTitre}>Qualité de la liste transmise</h3>
        <p className={s.note}>Aucune anomalie détectée : matricules, contacts et noms sont cohérents sur les {fr0.format(total)} fiches.</p>
      </section>
    );
  }
  return (
    <NewFeatureBubble id="rh-verifications-2026-11" block title="Qualité de la liste du personnel"
      lines={["Les points à faire corriger, regroupés par type, avec la direction régionale concernée."]}>
      <section className={`dashboard-card ${s.bloc}`} aria-labelledby="rh-verif">
        <div className={s.blocEntete}>
          <h3 id="rh-verif" className={s.blocTitre}>Qualité de la liste transmise</h3>
          <span className={s.note}>Contrôles automatiques des matricules, contacts, noms et numérotation.</span>
        </div>

        <div className={s.verifResume}>
          <div className={s.verifScore}>
            <div className={s.verifGrand}>{fr0.format(n)}<small>agents concernés sur {fr0.format(total)}</small></div>
            <div className={s.piste} role="img" aria-label={`${sans} fiches sans anomalie, ${n} avec anomalie`}>
              <span className={s.remplissage} style={{ width: `${(sans / total) * 100}%`, background: "#10b981", borderRadius: "5px 0 0 5px" }} />
              <span className={s.remplissage} style={{ width: `${(n / total) * 100}%`, background: "#fbbf24", borderRadius: "0 5px 5px 0" }} />
            </div>
            <p className={s.note}>
              <strong style={{ color: "#34d399" }}>{pct(sans / total)}</strong> des fiches sont sans anomalie ;{" "}
              <strong style={{ color: "#fbbf24" }}>{pct(n / total)}</strong> sont à vérifier.
              {v.rangsManquants.length > 0 && <> En plus : {v.rangsManquants.length === 1 ? "un numéro d’ordre manquant" : `${v.rangsManquants.length} numéros d’ordre manquants`} (n° {v.rangsManquants.map((m) => m.rang).join(", ")}).</>}
            </p>
          </div>
          <div className={s.verifDr}>
            <div className={s.verifSousTitre}>À faire corriger par direction régionale</div>
            <div className={s.barres}>
              {v.parDr.map((d) => (
                <div key={d.dr} className={s.barre}>
                  <span className={s.barreLibelle}>{d.dr}</span>
                  <span className={s.piste}>
                    <span className={s.remplissage} style={{ width: `${(d.total / maxDr) * 100}%`, background: "#fbbf24" }} />
                  </span>
                  <span className={s.barreValeur}>
                    {fr0.format(d.total)}
                    {d.lignesManquantes > 0 && <small>dont {d.lignesManquantes} ligne manquante</small>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={s.verifGrille}>
          {v.groupes.map((g) => <CarteVerif key={g.cle} g={g} controle={controle} />)}
        </div>
        <p className={s.pied}>Les données sont affichées telles que transmises par la DCCCI : aucune valeur n’a été modifiée.</p>
      </section>
    </NewFeatureBubble>
  );
}

/* ---------- Vue complète ---------- */

export default function RhVue({ personnes, dateListe, source, controle }: { personnes: Personne[]; dateListe: string | null; source: string | null; controle?: Controle }) {
  const a = useMemo(() => agreger(personnes), [personnes]);
  const v = useMemo(() => verifier(personnes), [personnes]);
  const [choisie, setChoisie] = useState<string>("");
  const [q, setQ] = useState("");
  const dr = a.directions.find((d) => d.dr === choisie) ?? a.directions[0];

  const recherche = q.trim().toLowerCase();
  const trouves = useMemo(() => {
    if (recherche.length < 2) return [];
    return personnes.filter((p) =>
      [p.nom, p.matricule ?? "", p.centre, p.dr, p.fonction, p.contact ?? ""].join(" ").toLowerCase().includes(recherche)
    );
  }, [personnes, recherche]);

  if (!personnes.length) {
    return <div className={`dashboard-card ${s.vide}`}>Aucune liste de personnel n’a encore été chargée.</div>;
  }

  return (
    <div className={s.racine}>
      <NewFeatureBubble id="rh-personnel-2026-11" block title="Ressources humaines"
        lines={["Nouvelle page : le personnel des 28 centres de l’intérieur, par direction régionale et par fonction."]}>
        <header className={s.hero}>
          <div>
            <div className={s.eyebrow}>Direction Générale · Ressources humaines</div>
            <h2 className={s.titre}><Users size={24} aria-hidden="true" /> Personnel des centres de l’intérieur</h2>
            <p className={s.sousTitre}>
              Liste transmise par la DCCCI{dateListe ? ` le ${dateLongue(dateListe)}` : ""}. Elle couvre {a.nbDr} directions régionales
              et {a.nbCentres} centres ; elle ne comprend pas le personnel de Conakry ni du siège.
            </p>
          </div>
          <label className={s.recherche}>
            <Search size={16} aria-hidden="true" />
            <span className={s.sr}>Rechercher un agent, un centre, un matricule ou une fonction</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un agent, un centre, un matricule…" />
          </label>
        </header>
      </NewFeatureBubble>

      {recherche.length >= 2 ? (
        <section className={`dashboard-card ${s.bloc}`} aria-live="polite">
          <div className={s.blocEntete}>
            <h3 className={s.blocTitre}>Résultats de la recherche</h3>
            <span className={s.note}>{fr0.format(trouves.length)} résultat{trouves.length > 1 ? "s" : ""}</span>
          </div>
          {trouves.length === 0 ? <p className={s.note}>Aucun agent ne correspond à « {q} ».</p>
            : <ul className={`${s.liste} ${s.listeDouble}`}>{trouves.map((p) => <Ligne key={p.rang} p={p} avecLieu />)}</ul>}
        </section>
      ) : (
        <>
          <Indicateurs a={a} />
          <div className={s.deux}>
            <Fonctions a={a} />
            <ParDirection a={a} choisie={dr.dr} onChoix={setChoisie} />
          </div>
          <Vigilance a={a} />
          <Verifications v={v} total={a.total} controle={controle} />

          <section id="rh-annuaire" className={`dashboard-card ${s.bloc}`} aria-labelledby="rh-annuaire-titre">
            <h3 id="rh-annuaire-titre" className={s.blocTitre}>Annuaire par direction régionale</h3>
            <div className={s.onglets} role="group" aria-label="Direction régionale">
              {a.directions.map((d) => (
                <button key={d.dr} type="button" aria-pressed={d.dr === dr.dr} onClick={() => setChoisie(d.dr)}>
                  {d.dr} <small>{d.total}</small>
                </button>
              ))}
            </div>
            <BlocDirection d={dr} />
          </section>

        </>
      )}

      <p className={s.pied}>Source : {source ?? "liste du personnel des centres"}. Les fonctions sont regroupées sous 8 intitulés pour les statistiques.</p>
    </div>
  );
}
