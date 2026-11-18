"use client";
// components/qualite/SectionAnomaliesDG.tsx
// Section « Anomalies de données » de la page /import/quality, rédigée pour le DG.
import { useEffect, useState } from "react";
import { NewFeatureBubble } from '@/components/NewFeatureBubble';
import s from "./anomalies.module.css";

type Ligne = { libelle: string; en_base: number; recalcule: number };
type Anomalie = {
  id: number;
  constatee_le: string;
  perimetre: string;
  titre: string;
  statut: "corrigee" | "a_corriger_source" | "a_verifier" | "en_cours";
  gravite: "haute" | "moyenne" | "faible";
  constat: string;
  cause: string | null;
  impact: string | null;
  exemple: string | null;
  action: string | null;
  unite: string | null;
  libelle_a: string | null;
  libelle_b: string | null;
  comparaison: Ligne[] | null;
  ecart_gnf: number | null;
  corrigee_le: string | null;
};
type Saisie = { zone: string; agence: string; mois: number; categorie: string; alerte_qualite: string };

const STATUT: Record<Anomalie["statut"], { libelle: string; classe: string }> = {
  corrigee: { libelle: "Corrigée", classe: s.ok },
  a_corriger_source: { libelle: "À corriger à la source", classe: s.attention },
  a_verifier: { libelle: "À vérifier", classe: s.attention },
  en_cours: { libelle: "Vérification en cours", classe: s.info },
};
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const CATEGORIE: Record<string, string> = { "ADM Gle": "Administration", BF: "Bornes-fontaines" };

const fr2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fr1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function Comparatif({ a }: { a: Anomalie }) {
  const lignes = a.comparaison ?? [];
  if (!lignes.length) return null;
  const egal = (l: Ligne) => Math.abs(l.en_base - l.recalcule) < 0.005;
  const identiques = lignes.filter(egal);
  const ecarts = lignes.filter((l) => !egal(l));
  const u = a.unite ? ` (${a.unite})` : "";

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">Période</th>
            <th scope="col" className={s.num}>{(a.libelle_a || "Dans la base") + u}</th>
            <th scope="col" className={s.num}>{(a.libelle_b || "Recalculé depuis le fichier") + u}</th>
            <th scope="col" className={s.num}>Écart</th>
          </tr>
        </thead>
        <tbody>
          {identiques.length > 1 && (
            <tr>
              <td>{identiques.map((l) => l.libelle).join(", ")}</td>
              <td className={s.num}>{identiques.map((l) => fr2.format(l.en_base)).join(" / ")}</td>
              <td className={s.num}>identiques</td>
              <td className={s.num}>0</td>
            </tr>
          )}
          {identiques.length === 1 && (
            <tr>
              <td>{identiques[0].libelle}</td>
              <td className={s.num}>{fr2.format(identiques[0].en_base)}</td>
              <td className={s.num}>{fr2.format(identiques[0].recalcule)}</td>
              <td className={s.num}>0</td>
            </tr>
          )}
          {ecarts.map((l) => (
            <tr key={l.libelle} className={s.ligneEcart}>
              <td><strong>{l.libelle}</strong></td>
              <td className={s.num}><strong>{fr2.format(l.en_base)}</strong></td>
              <td className={s.num}><strong>{fr2.format(l.recalcule)}</strong></td>
              <td className={s.num}><strong>{l.en_base > l.recalcule ? "+" : ""}{fr2.format(l.en_base - l.recalcule)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fiche({ a }: { a: Anomalie }) {
  const st = STATUT[a.statut];
  const rubriques: [string, string | null][] = [
    ["Ce qui a été constaté", a.constat],
    ["Cause probable", a.cause],
    ["Conséquence", a.impact],
    ["Exemple", a.exemple],
    [a.statut === "corrigee" ? "Correction appliquée" : "Action demandée", a.action],
  ];
  return (
    <article className={`${s.fiche} ${a.gravite === "haute" ? s.ficheHaute : ""}`}>
      <div className={s.ficheHaut}>
        <span className={`${s.statut} ${st.classe}`}>{st.libelle}</span>
        <span className={s.meta}>
          {a.perimetre}, constaté le {date(a.constatee_le)}
          {a.corrigee_le ? `, corrigé le ${date(a.corrigee_le)}` : ""}
        </span>
      </div>
      <h4 className={s.ficheTitre}>{a.titre}</h4>
      {a.ecart_gnf ? (
        <p className={s.ecart}>
          {a.statut === "corrigee" ? "Écart corrigé : " : "Écart : "}
          <strong>{fr1.format(Math.abs(a.ecart_gnf) / 1e9)} Md GNF</strong>
        </p>
      ) : null}
      <Comparatif a={a} />
      <dl className={s.rubriques}>
        {rubriques.filter(([, t]) => t).map(([titre, texte]) => (
          <div key={titre}>
            <dt>{titre}</dt>
            <dd>{texte}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default function SectionAnomaliesDG() {
  const [anomalies, setAnomalies] = useState<Anomalie[] | null>(null);
  const [saisies, setSaisies] = useState<Saisie[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/anomalies-dg", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
        setAnomalies(j.anomalies);
        setSaisies(j.saisies);
      })
      .catch((e) => setErreur(e.message));
  }, []);

  const nb = (st: Anomalie["statut"]) => (anomalies ?? []).filter((a) => a.statut === st).length;
  const aCorriger = nb("a_corriger_source") + nb("a_verifier");

  return (
    <NewFeatureBubble id="anomalies-dg-2026-11" block title="Anomalies des données" lines={["Les écarts détectés dans les fichiers reçus, expliqués, avec les corrections appliquées."]}>
      <section className="dashboard-card" aria-labelledby="titre-anomalies-dg">
        <div className="card-header-flex">
          <div>
            <h3 id="titre-anomalies-dg">Anomalies détectées dans les données</h3>
            <p className={s.intro}>
              Chaque fichier reçu est recalculé à partir de ses lignes mensuelles et comparé à ce qui est
              enregistré. Les écarts sont expliqués ici, avec ce qui a été corrigé.
            </p>
          </div>
          {anomalies && (
            <span className="badge-pill cyan">
              {nb("corrigee")} corrigée{nb("corrigee") > 1 ? "s" : ""}, {aCorriger} à corriger
            </span>
          )}
        </div>

        {erreur && <p className={s.erreur}>Impossible de charger les anomalies : {erreur}</p>}
        {!erreur && !anomalies && <p className={s.intro}>Chargement…</p>}
        {anomalies && anomalies.length === 0 && (
          <p className={s.intro}>Aucune anomalie enregistrée : les données chargées correspondent aux fichiers reçus.</p>
        )}

        <div className={s.liste}>
          {anomalies?.map((a) => <Fiche key={a.id} a={a} />)}
        </div>

        {saisies.length > 0 && (
          <details className={s.saisies}>
            <summary>
              {saisies.length} valeur{saisies.length > 1 ? "s" : ""} de saisie suspecte{saisies.length > 1 ? "s" : ""} dans
              les rapports des agences et centres
            </summary>
            <p className={s.intro}>
              Montants incohérents entre HT et TTC, ou prix au m³ très éloigné de la normale de la catégorie
              (chiffre manquant ou en trop probable). Ils sont comptés tels que transmis ; à faire corriger
              par l’agence concernée.
            </p>
            <ul>
              {saisies.map((x, i) => (
                <li key={i}>
                  <strong>{x.agence}</strong>, {MOIS[x.mois - 1]}, {CATEGORIE[x.categorie] ?? x.categorie} : {x.alerte_qualite}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </NewFeatureBubble>
  );
}
