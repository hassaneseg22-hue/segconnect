"use client";
// components/facturation/SectionFacturation.tsx
// Section « Facturation 2026 » de la page /tableau-technique.
import { useEffect, useMemo, useState } from "react";
import s from "./facturation.module.css";
import { NewFeatureBubble } from '@/components/NewFeatureBubble';
import { gnf, m3, pct, entier, plageMois, MOIS_COURT, MOIS_LONG, type Facturation } from "./format";

type Zone = "all" | "Conakry" | "Intérieur";
type Periode = "cumul" | "S1" | "S2";

const ZONES: { v: Zone; l: string }[] = [
  { v: "all", l: "National" }, { v: "Conakry", l: "Conakry" }, { v: "Intérieur", l: "Intérieur" },
];
const PERIODES: { v: Periode; l: string }[] = [
  { v: "cumul", l: "Cumul 2026" }, { v: "S1", l: "1er semestre" }, { v: "S2", l: "2e semestre" },
];

function Segment<T extends string>({ options, valeur, onChange, label }: {
  options: { v: T; l: string }[]; valeur: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className={s.segment} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={valeur === o.v} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function GraphMensuel({ mensuel, zone }: { mensuel: Facturation["mensuel"]; zone: Zone }) {
  const W = 720, H = 230, G = 44, B = 26, haut = 12;
  const max = Math.max(1, ...mensuel.map((m) => m.conakry + m.interieur));
  const pasY = max > 30e9 ? 10e9 : max > 10e9 ? 5e9 : max > 2e9 ? 1e9 : 250e6;
  const plafond = Math.ceil(max / pasY) * pasY;
  const y = (v: number) => H - B - (v / plafond) * (H - B - haut);
  const largeur = (W - G) / 12;
  const graduations = Array.from({ length: Math.floor(plafond / pasY) + 1 }, (_, i) => i * pasY);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.graph} role="img"
      aria-label="Chiffre d'affaires TTC facturé par mois, en GNF">
      {graduations.map((g) => (
        <g key={g}>
          <line x1={G} x2={W} y1={y(g)} y2={y(g)} stroke="rgba(127,127,127,.2)" />
          <text x={G - 6} y={y(g) + 4} textAnchor="end" opacity={0.7}>{g === 0 ? "0" : gnf(g)}</text>
        </g>
      ))}
      {mensuel.map((m, i) => {
        const x = G + i * largeur + largeur * 0.18, w = largeur * 0.64;
        const total = m.conakry + m.interieur;
        if (!total) return (
          <g key={m.mois}>
            <rect x={x} y={H - B - 3} width={w} height={3} fill="rgba(127,127,127,.25)" />
            <text x={x + w / 2} y={H - 8} textAnchor="middle" opacity={0.45}>{MOIS_COURT[i]}</text>
          </g>
        );
        const yC = y(m.conakry), yT = y(total);
        return (
          <g key={m.mois}>
            <title>{`${MOIS_LONG[i]} : ${gnf(total)} GNF TTC (Conakry ${gnf(m.conakry)}, intérieur ${gnf(m.interieur)})`}</title>
            {zone !== "Intérieur" && m.conakry > 0 && (
              <rect x={x} y={yC} width={w} height={H - B - yC} fill="var(--eau)" rx={2} />
            )}
            {zone !== "Conakry" && m.interieur > 0 && (
              <rect x={x} y={yT} width={w} height={(zone === "Intérieur" ? H - B : yC) - yT} fill="var(--lagune)" rx={2} />
            )}
            <text x={x + w / 2} y={yT - 5} textAnchor="middle" style={{ fontSize: 10, fontWeight: 600 }}>
              {gnf(total).replace(" Md", "")}
            </text>
            <text x={x + w / 2} y={H - 8} textAnchor="middle" opacity={0.75}>{MOIS_COURT[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SectionFacturation() {
  const [zone, setZone] = useState<Zone>("all");
  const [periode, setPeriode] = useState<Periode>("cumul");
  const [data, setData] = useState<Facturation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(true);

  useEffect(() => {
    let annule = false;
    setCharge(true); setErreur(null);
    fetch(`/api/facturation?zone=${encodeURIComponent(zone)}&periode=${periode}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
        return j as Facturation;
      })
      .then((j) => { if (!annule) setData(j); })
      .catch((e) => { if (!annule) setErreur(e.message); })
      .finally(() => { if (!annule) setCharge(false); });
    return () => { annule = true; };
  }, [zone, periode]);

  const maxCat = useMemo(() => Math.max(1, ...(data?.categories ?? []).map((c) => c.ca_ttc)), [data]);
  const maxAg = useMemo(() => Math.max(1, ...(data?.agences ?? []).map((a) => a.ca_ttc)), [data]);
  const k = data?.kpis;

  return (
    <NewFeatureBubble id="facturation-2026-tech" block title="Facturation et chiffre d’affaires 2026" lines={["Nouvelle section : Conakry et intérieur, par agence, catégorie et mois."]}>
      <section className={s.racine} aria-labelledby="titre-facturation">
        <div className={s.entete}>
          <div>
            <h2 id="titre-facturation" className={s.titre}>Facturation et chiffre d’affaires 2026</h2>
            <p className={s.sousTitre}>
              Conakry : {plageMois(data?.couverture?.["Conakry"])}. Intérieur : {plageMois(data?.couverture?.["Intérieur"])}.
            </p>
          </div>
          <div className={s.filtres}>
            <Segment label="Zone" options={ZONES} valeur={zone} onChange={setZone} />
            <Segment label="Période" options={PERIODES} valeur={periode} onChange={setPeriode} />
          </div>
        </div>

        {erreur && <div className={`${s.bloc} ${s.etat} ${s.erreur}`}>Impossible de charger la facturation : {erreur}</div>}
        {!erreur && charge && !data && <div className={`${s.bloc} ${s.etat}`}>Chargement de la facturation…</div>}

        {data && k && (
          <>
            <div className={s.kpis} style={{ opacity: charge ? 0.6 : 1 }}>
              <div className={s.kpi}>
                <div className={s.kpiValeur}>{gnf(k.ca_ttc)}<span className={s.kpiUnite}>GNF</span></div>
                <div className={s.kpiLibelle}>Chiffre d’affaires TTC facturé</div>
              </div>
              <div className={s.kpi} style={{ borderTopColor: "var(--lagune)" }}>
                <div className={s.kpiValeur}>{gnf(k.ca_ht)}<span className={s.kpiUnite}>GNF</span></div>
                <div className={s.kpiLibelle}>Chiffre d’affaires HT</div>
                {k.agences_sans_ht.length > 0 && (
                  <div className={s.kpiNote}>Hors {k.agences_sans_ht.join(", ")} (HT non transmis)</div>
                )}
              </div>
              <div className={s.kpi}>
                <div className={s.kpiValeur}>{m3(k.volume_facture)}<span className={s.kpiUnite}>m³</span></div>
                <div className={s.kpiLibelle}>Volume facturé ({m3(k.volume_consomme)} m³ consommés relevés)</div>
              </div>
              <div className={s.kpi} style={{ borderTopColor: "var(--lagune)" }}>
                <div className={s.kpiValeur}>{entier(k.prix_moyen_ttc)}<span className={s.kpiUnite}>GNF/m³</span></div>
                <div className={s.kpiLibelle}>Prix moyen TTC facturé, sur {k.nb_agences} agences</div>
              </div>
            </div>

            <div className={s.bloc}>
              <h3 className={s.blocTitre}>Chiffre d’affaires TTC par mois (GNF)</h3>
              <div className={s.legende}>
                {zone !== "Intérieur" && <span><i className={s.pastille} style={{ background: "var(--eau)" }} />Conakry</span>}
                {zone !== "Conakry" && <span><i className={s.pastille} style={{ background: "var(--lagune)" }} />Intérieur</span>}
              </div>
              <GraphMensuel mensuel={data.mensuel} zone={zone} />
              <p className={s.note}>
                Les abonnés domestiques sont facturés tous les deux mois, en alternance selon les agences :
                les écarts d’un mois sur l’autre sont donc normaux.
              </p>
            </div>

            <div className={s.deuxColonnes}>
              <div className={s.bloc}>
                <h3 className={s.blocTitre}>Classement des agences</h3>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th scope="col">Agence</th>
                        <th scope="col" className={s.num}>CA TTC (GNF)</th>
                        <th scope="col" className={s.num}>Part</th>
                        <th scope="col" className={s.num}>Volume (m³)</th>
                        <th scope="col">Dernier mois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agences.map((a) => (
                        <tr key={a.agence}>
                          <td>
                            {a.agence}{" "}
                            {zone === "all" && <span className={s.zoneTag}>{a.zone === "Conakry" ? "Conakry" : "Intérieur"}</span>}
                            {a.alertes > 0 && <span className={s.alerteTag} title={`${a.alertes} anomalie(s) de saisie`}> !</span>}
                          </td>
                          <td className={s.num}>{gnf(a.ca_ttc)}</td>
                          <td className={s.num}>
                            <span className={s.barrePart} style={{
                              width: `${Math.max(2, (a.ca_ttc / maxAg) * 60)}px`,
                              background: a.zone === "Conakry" ? "var(--eau)" : "var(--lagune)",
                            }} />
                            {pct(a.part)}
                          </td>
                          <td className={s.num}>{m3(a.volume_facture)}</td>
                          <td>{a.dernier_mois ? MOIS_COURT[a.dernier_mois - 1] : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={s.bloc}>
                <h3 className={s.blocTitre}>Répartition par catégorie d’abonnés</h3>
                {data.categories.filter((c) => c.ca_ttc > 0).map((c) => (
                  <div key={c.categorie}>
                    <div className={s.cat}>
                      <span>{c.categorie === "ADM Gle" ? "Administration" : c.categorie === "BF" ? "Bornes-fontaines" : c.categorie}</span>
                      <div className={s.catPiste}><div className={s.catBarre} style={{ width: `${(c.ca_ttc / maxCat) * 100}%` }} /></div>
                      <span style={{ textAlign: "right" }}>{pct(c.part)}</span>
                    </div>
                    <div className={s.cat}><span /><span className={s.catPrix}>{gnf(c.ca_ttc)} GNF, {entier(c.prix_moyen)} GNF/m³</span></div>
                  </div>
                ))}
              </div>
            </div>

            {data.alertes.length > 0 && (
              <details className={`${s.bloc} ${s.details}`}>
                <summary>
                  {data.alertes.length} valeur{data.alertes.length > 1 ? "s" : ""} à vérifier dans les rapports transmis
                </summary>
                <ul>
                  {data.alertes.map((a, i) => (
                    <li key={i}>{a.agence}, {MOIS_LONG[a.mois - 1]}, {a.categorie} : {a.message}</li>
                  ))}
                </ul>
                <p className={s.note} style={{ marginTop: 10 }}>
                  Ces lignes sont comptées telles que transmises. À corriger à la source par les agences concernées.
                </p>
              </details>
            )}
          </>
        )}
      </section>
    </NewFeatureBubble>
  );
}
