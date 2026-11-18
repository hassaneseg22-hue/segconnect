"use client";
// components/centres/SectionSituationDR.tsx
// Page « Centres de l'intérieur » : situation d'une direction régionale transmise à la DCCCI
// (problèmes techniques, produits chimiques et carburant, besoins en personnel, mobilier de bureau).
// v2 (16/11/2026) : DR Labé ; stocks déclarés et autonomie en jours ; DR la plus récente ouverte par défaut.
import { useEffect, useMemo, useState } from "react";
import { Wrench, FlaskConical, Fuel, Users, Armchair, FileText, Gauge } from "lucide-react";
import { NewFeatureBubble } from "@/components/NewFeatureBubble";
import {
  situations, totaux, COLONNES_MOBILIER, aDesStocks, autonomies, carburantParJour, libelleAutonomie, niveauAutonomie,
  type LigneSituation, type Situation, type Autonomie,
} from "@/lib/situation-dr";
import s from "./situation.module.css";

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const v = (n: number | null) => (n === null ? "—" : fr.format(n));
const dateLongue = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

type Onglet = "problemes" | "intrants" | "personnel" | "mobilier";

const CLASSE_NIVEAU = { critique: s.critique, alerte: s.alerte, correct: s.correct } as const;

/** Bandeau « Stocks à surveiller » : visible seulement si la DR a déclaré ses stocks. */
function Autonomies({ items }: { items: Autonomie[] }) {
  const urgents = items.filter((a) => a.jours < 7);
  const autres = items.length - urgents.length;
  return (
    <div className={s.stocks}>
      <div className={s.stocksTete}>
        <h4 className={s.sousTitre}><Gauge size={15} aria-hidden="true" /> Stocks à surveiller</h4>
        <p className={s.note}>Autonomie = stock déclaré ÷ consommation journalière déclarée.</p>
      </div>
      {urgents.length > 0 ? (
        <div className={s.stocksGrille}>
          {urgents.map((a) => {
            const niv = niveauAutonomie(a.jours);
            return (
              <div key={a.centre + a.libelle} className={`${s.stock} ${CLASSE_NIVEAU[niv]}`}>
                <div className={s.stockLieu}>{a.centre}</div>
                <div className={s.stockProduit}>{a.nature === "carburant" ? <Fuel size={14} aria-hidden="true" /> : <FlaskConical size={14} aria-hidden="true" />}{a.libelle}</div>
                <div className={s.stockValeur}>{libelleAutonomie(a.jours)}</div>
                <div className={s.stockDetail}>Stock {v(a.stock)} {a.unite} · {v(a.parJour >= 10 ? Math.round(a.parJour) : Math.round(a.parJour * 100) / 100)} {a.unite}/jour</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={s.note}>Aucun stock déclaré ne descend sous une semaine d’autonomie.</p>
      )}
      {autres > 0 && urgents.length > 0 && (
        <p className={s.note}>{autres} autre{autres > 1 ? "s" : ""} stock{autres > 1 ? "s" : ""} couvre{autres > 1 ? "nt" : ""} plus d’une semaine (détail dans « Produits chimiques et carburant »).</p>
      )}
    </div>
  );
}

function Problemes({ sit }: { sit: Situation }) {
  return (
    <div className={s.grilleCartes}>
      {sit.problemes.map((p) => (
        <article key={p.centre} className={`${s.carte} ${p.items.length > 6 ? s.carteLarge : ""}`}>
          <header className={s.carteTete}>
            <h4>{p.centre}</h4>
            <span className={s.badge}>{p.items.length} problème{p.items.length > 1 ? "s" : ""}</span>
          </header>
          <ol className={s.problemes}>
            {p.items.map((it, i) => (
              <li key={i}>
                <div className={s.probleme}>{it.probleme}</div>
                {it.solution && <div className={s.solution}><span>Solution proposée</span>{it.solution}</div>}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  );
}

function CelluleAutonomie({ jours }: { jours: number | null }) {
  if (jours === null) return <>—</>;
  return <span className={`${s.pastille} ${CLASSE_NIVEAU[niveauAutonomie(jours)]}`}>{libelleAutonomie(jours)}</span>;
}

function Intrants({ sit }: { sit: Situation }) {
  const t = totaux(sit);
  const stocks = aDesStocks(sit);
  const stockChim = sit.chimiques.some((c) => c.lignes.some((l) => l.stock_kg !== null));
  const stockCarb = sit.energies.some((c) => c.lignes.some((l) => l.stock_l !== null));
  const autonomieChim = (l: { stock_kg: number | null; jour_kg: number | null }) =>
    l.stock_kg !== null && l.jour_kg ? l.stock_kg / l.jour_kg : null;
  return (
    <div className={`${s.deuxCol} ${stocks ? s.uneCol : ""}`}>
      <div>
        <h4 className={s.sousTitre}><FlaskConical size={15} aria-hidden="true" /> Produits chimiques (kg)</h4>
        <div className={s.defile}>
          <table className={s.tableau}>
            <thead>
              <tr>
                <th scope="col">Centre</th><th scope="col">Produit</th>
                {stockChim && <th scope="col">Stock</th>}
                <th scope="col">Jour</th>
                {stockChim && <th scope="col">Autonomie</th>}
                <th scope="col">Mois</th><th scope="col">Trimestre</th>
              </tr>
            </thead>
            <tbody>
              {sit.chimiques.flatMap((c) => c.lignes.map((l, i) => (
                <tr key={c.centre + l.designation}>
                  <td>{i === 0 ? <strong>{c.centre}</strong> : ""}</td><td>{l.designation}</td>
                  {stockChim && <td className={l.stock_kg === 0 && l.jour_kg ? s.vide : ""}>{v(l.stock_kg)}</td>}
                  <td>{v(l.jour_kg)}</td>
                  {stockChim && <td><CelluleAutonomie jours={autonomieChim(l)} /></td>}
                  <td>{v(l.mois_kg)}</td><td>{v(l.trimestre_kg)}</td>
                </tr>
              )))}
            </tbody>
            <tfoot>
              {t.parProduit.map((p) => (
                <tr key={p.designation}>
                  <td>Total</td><td>{p.designation}</td>
                  {stockChim && <td>{v(p.stock)}</td>}
                  <td>{v(p.jour)}</td>
                  {stockChim && <td />}
                  <td>{v(p.mois)}</td><td>{v(p.trimestre)}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        <p className={s.note}>Les totaux sont calculés à partir des lignes ci-dessus ; ils ne figurent pas dans le fichier transmis.{stocks ? " Stock : quantité disponible au jour du rapport." : ""}</p>
      </div>

      <div>
        <h4 className={s.sousTitre}><Fuel size={15} aria-hidden="true" /> Énergie et carburant des groupes électrogènes (litres)</h4>
        <div className={s.defile}>
          <table className={s.tableau}>
            <thead>
              <tr>
                <th scope="col">Centre</th><th scope="col">Source</th><th scope="col">Conso. horaire</th><th scope="col">Fonctionnement</th>
                {stockCarb && <th scope="col">Stock</th>}
                {stockCarb && <th scope="col">Autonomie</th>}
                <th scope="col">Mois</th><th scope="col">Trimestre</th>
              </tr>
            </thead>
            <tbody>
              {sit.energies.flatMap((c) => {
                const parJour = carburantParJour(c.lignes);
                return c.lignes.map((l, i) => (
                  <tr key={c.centre + i}>
                    <td>{i === 0 ? <strong>{c.centre}</strong> : ""}</td>
                    <td>{l.source ?? ""}</td><td>{l.conso_horaire ?? "—"}</td><td>{l.temps ?? "—"}</td>
                    {stockCarb && <td className={l.stock_l === 0 && parJour ? s.vide : ""}>{l.stock_l !== null ? v(l.stock_l) : ""}</td>}
                    {stockCarb && <td>{l.stock_l !== null ? <CelluleAutonomie jours={parJour ? l.stock_l / parJour : null} /> : ""}</td>}
                    <td>{l.mensuelle_l !== null ? v(l.mensuelle_l) : (l.mensuelle_txt ?? "—")}</td>
                    <td>{v(l.trimestre_l)}</td>
                  </tr>
                ));
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total des groupes électrogènes</td>
                {stockCarb && <td>{v(t.carburantStock)}</td>}
                {stockCarb && <td />}
                <td>{v(t.carburantMois)}</td><td>{v(t.carburantTrimestre)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={s.note}>EDG : électricité du réseau, sans carburant. « Néant » : aucune consommation de carburant déclarée.{stockCarb ? " Autonomie calculée sur une consommation mensuelle de 30 jours." : ""}</p>
      </div>

      {sit.notes.length > 0 && (
        <div className={`${s.notes} ${s.pleine}`}>
          <div className={s.sousTitre}><FileText size={15} aria-hidden="true" /> Remarques de la direction régionale</div>
          <ul>{sit.notes.map((n, i) => <li key={i}><strong>{n.centre}</strong> : {n.texte}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Personnel({ sit }: { sit: Situation }) {
  const t = totaux(sit);
  const sansBesoin = sit.centres.filter((c) => !sit.besoins.some((b) => b.centre === c));
  return (
    <div className={s.defile}>
      <table className={s.tableau}>
        <thead><tr><th scope="col">Centre</th><th scope="col">Profil demandé</th><th scope="col">Nombre</th><th scope="col" className={s.gauche}>Observation de la direction régionale</th></tr></thead>
        <tbody>
          {sit.besoins.flatMap((c) => c.lignes.map((l, i) => (
            <tr key={c.centre + l.profil}>
              <td>{i === 0 ? <strong>{c.centre}</strong> : ""}</td><td>{l.profil}</td>
              <td><span className={s.nombre}>{l.nombre}</span></td><td className={s.gauche}>{l.observation ?? "—"}</td>
            </tr>
          )))}
        </tbody>
        <tfoot><tr><td colSpan={2}>Total des postes demandés</td><td><span className={s.nombre}>{t.postes}</span></td><td /></tr></tfoot>
      </table>
      {sansBesoin.length > 0 && (
        <p className={s.note}>
          {sansBesoin.join(", ")} {sansBesoin.length > 1 ? "ne signalent" : "ne signale"} aucun besoin en personnel.
        </p>
      )}
    </div>
  );
}

function MobilierBureau({ sit }: { sit: Situation }) {
  const t = totaux(sit);
  return (
    <div className={s.defile}>
      <table className={`${s.tableau} ${s.matrice}`}>
        <thead>
          <tr><th scope="col">Structure</th><th scope="col">Bénéficiaire</th>{COLONNES_MOBILIER.map((c) => <th key={c.cle} scope="col" title={c.groupe}>{c.court}</th>)}</tr>
        </thead>
        <tbody>
          {sit.mobilier.flatMap((c) => c.lignes.map((l, i) => (
            <tr key={c.centre + l.beneficiaire}>
              <td>{i === 0 ? <strong>{c.centre}</strong> : ""}</td><td>{l.beneficiaire}</td>
              {COLONNES_MOBILIER.map((k) => <td key={k.cle} className={l[k.cle] ? s.plein : s.zero}>{l[k.cle]}</td>)}
            </tr>
          )))}
        </tbody>
        <tfoot><tr><td colSpan={2}>Total demandé</td>{t.mobilierTotal.map((k) => <td key={k.cle}>{k.total}</td>)}</tr></tfoot>
      </table>
    </div>
  );
}

export default function SectionSituationDR() {
  const [lignes, setLignes] = useState<LigneSituation[] | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("problemes");
  const [choisie, setChoisie] = useState<string>("");

  useEffect(() => {
    let annule = false;
    fetch("/api/situation-dr", { cache: "no-store", credentials: "include" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (!annule) setLignes(j.lignes as LigneSituation[]);
      })
      .catch(() => { if (!annule) setLignes([]); }); // pas d'accès ou table absente : la section n'apparaît pas
    return () => { annule = true; };
  }, []);

  const sits = useMemo(() => (lignes ? situations(lignes) : []), [lignes]);
  const sit = sits.find((x) => x.dr === choisie) ?? sits[0];
  const t = useMemo(() => (sit ? totaux(sit) : null), [sit]);
  const auto = useMemo(() => (sit && aDesStocks(sit) ? autonomies(sit) : []), [sit]);
  if (!sit || !t) return null;

  const hth = t.parProduit.find((p) => p.designation === "HTH");
  const sulfate = t.parProduit.find((p) => p.designation.startsWith("Sulfate"));
  const nbMobilier = t.mobilierTotal.reduce((n, k) => n + k.total, 0);
  const onglets: { cle: Onglet; libelle: string; icone: React.ReactNode; n: number }[] = [
    { cle: "problemes", libelle: "Problèmes techniques", icone: <Wrench size={15} aria-hidden="true" />, n: t.nbProblemes },
    { cle: "intrants", libelle: "Produits chimiques et carburant", icone: <FlaskConical size={15} aria-hidden="true" />, n: t.nbCentres },
    { cle: "personnel", libelle: "Besoins en personnel", icone: <Users size={15} aria-hidden="true" />, n: t.postes },
    ...(nbMobilier > 0 ? [{ cle: "mobilier" as Onglet, libelle: "Mobilier de bureau", icone: <Armchair size={15} aria-hidden="true" />, n: nbMobilier }] : []),
  ];
  const ongletActif: Onglet = onglets.some((o) => o.cle === onglet) ? onglet : "problemes";

  return (
    <NewFeatureBubble id="centres-situation-dr-labe-2026-11" block title="Situation de la DR Labé"
      lines={[
        "Nouveau : la situation des 4 centres de Labé (Labé, Lélouma, Mali, Tougué), transmise le 16/11/2026.",
        "Les stocks de produits chimiques et de carburant sont affichés avec leur autonomie en jours. Les boutons en haut à droite permettent de revoir N’Zérékoré.",
      ]}>
      <section className={`dashboard-card ${s.racine}`} aria-labelledby="sit-dr-titre">
        <header className={s.entete}>
          <div>
            <div className={s.eyebrow}>DCCCI · Situation d’une direction régionale</div>
            <h3 id="sit-dr-titre" className={s.titre}>Direction régionale de {sit.dr}</h3>
            <p className={s.sousTexte}>Situation transmise le {dateLongue(sit.date)} par le Directeur Régional, {t.nbCentres} centres : {sit.centres.join(", ")}.</p>
          </div>
          {sits.length > 1 && (
            <div className={s.choixDr} role="group" aria-label="Direction régionale">
              {sits.map((x) => <button key={x.dr} type="button" aria-pressed={x.dr === sit.dr} onClick={() => setChoisie(x.dr)}>{x.dr}</button>)}
            </div>
          )}
        </header>

        <div className={s.kpis}>
          <div className={s.kpi} style={{ ["--accent" as string]: "#f87171" }}><b>{t.nbProblemes}</b><span>problèmes techniques signalés</span><small>dans {t.nbCentres} centres</small></div>
          <div className={s.kpi} style={{ ["--accent" as string]: "#c084fc" }}><b>{v(hth?.mois ?? null)} kg</b><span>de HTH par mois</span><small>{hth && hth.stock !== null ? `stock déclaré : ${v(hth.stock)} kg` : `sulfate d’aluminium : ${v(sulfate?.mois ?? null)} kg`}</small></div>
          <div className={s.kpi} style={{ ["--accent" as string]: "#f59e0b" }}><b>{v(t.carburantMois)} L</b><span>de carburant par mois</span><small>{t.carburantStock !== null ? `stock déclaré : ${v(t.carburantStock)} L` : "groupes électrogènes déclarés"}</small></div>
          <div className={s.kpi} style={{ ["--accent" as string]: "#38bdf8" }}><b>{t.postes}</b><span>postes demandés</span><small>agents de station, de zone, plombiers, caissières</small></div>
        </div>

        {auto.length > 0 && <Autonomies items={auto} />}

        <div className={s.onglets} role="tablist" aria-label="Rubriques de la situation">
          {onglets.map((o) => (
            <button key={o.cle} type="button" role="tab" id={`sit-t-${o.cle}`} aria-selected={ongletActif === o.cle} aria-controls={`sit-p-${o.cle}`} onClick={() => setOnglet(o.cle)}>
              {o.icone}{o.libelle}<small>{o.n}</small>
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`sit-p-${ongletActif}`} aria-labelledby={`sit-t-${ongletActif}`} className={s.panneau}>
          {ongletActif === "problemes" && <Problemes sit={sit} />}
          {ongletActif === "intrants" && <Intrants sit={sit} />}
          {ongletActif === "personnel" && <Personnel sit={sit} />}
          {ongletActif === "mobilier" && <MobilierBureau sit={sit} />}
        </div>
        <p className={s.pied}>Source : {sit.source}. Valeurs telles que transmises par la direction régionale.</p>
      </section>
    </NewFeatureBubble>
  );
}
