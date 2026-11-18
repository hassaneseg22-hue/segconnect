// lib/situation-dr.ts
// Situation d'une direction régionale transmise à la DCCCI : types et calculs.
// Les valeurs sont celles du fichier transmis ; les totaux sont recalculés à partir des lignes.
// v2 (16/11/2026) : stocks déclarés (stock_kg, stock_l) et autonomie en jours ; DR la plus récente en premier.

export type Rubrique = "produits_chimiques" | "energie" | "problemes" | "personnel" | "mobilier" | "notes";

export type LigneSituation = {
  dr: string;
  date_rapport: string;
  rubrique: Rubrique;
  centre: string;
  ordre: number;
  donnees: Record<string, unknown>;
  source_document: string;
};

export type Chimique = { designation: string; jour_kg: number | null; mois_kg: number | null; trimestre_kg: number | null; stock_kg: number | null };
export type Energie = {
  source: string | null; conso_horaire: string | null; temps: string | null;
  mensuelle_l: number | null; trimestre_l: number | null; mensuelle_txt: string | null; stock_l: number | null;
};
export type Probleme = { probleme: string; solution: string };
export type Besoin = { profil: string; nombre: number; observation: string | null };
export type Mobilier = { beneficiaire: string } & Record<(typeof COLONNES_MOBILIER)[number]["cle"], number>;

export const COLONNES_MOBILIER = [
  { cle: "bureau_retour", court: "Bureau retour", groupe: "Bureau" },
  { cle: "bureau_simple", court: "Bureau simple", groupe: "Bureau" },
  { cle: "armoire_vitree", court: "Armoire vitrée", groupe: "Rangement" },
  { cle: "placard_metallique", court: "Placard métallique", groupe: "Rangement" },
  { cle: "fauteuil_haut_dossier", court: "Fauteuil haut dossier", groupe: "Sièges" },
  { cle: "fauteuil_bas_dossier", court: "Fauteuil bas dossier", groupe: "Sièges" },
  { cle: "coffre_fort", court: "Coffre fort", groupe: "Autres" },
  { cle: "ecran_tv_accueil", court: "Écran TV d’accueil", groupe: "Autres" },
  { cle: "chaises_visiteurs", court: "Chaises visiteurs", groupe: "Accueil" },
  { cle: "banquettes_accueil", court: "Banquettes d’accueil", groupe: "Accueil" },
] as const;

export type Situation = {
  dr: string;
  date: string;
  source: string;
  centres: string[];
  problemes: { centre: string; items: Probleme[] }[];
  chimiques: { centre: string; lignes: Chimique[] }[];
  energies: { centre: string; lignes: Energie[] }[];
  besoins: { centre: string; lignes: Besoin[] }[];
  mobilier: { centre: string; lignes: Mobilier[] }[];
  notes: { centre: string; texte: string }[];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function parCentre<T>(lignes: LigneSituation[], rubrique: Rubrique, f: (d: Record<string, unknown>) => T) {
  const m = new Map<string, T[]>();
  for (const l of lignes.filter((x) => x.rubrique === rubrique).sort((a, b) => a.ordre - b.ordre)) {
    m.set(l.centre, [...(m.get(l.centre) ?? []), f(l.donnees)]);
  }
  return m;
}

/** Dernière situation de chaque direction régionale (la plus récente date_rapport), la DR la plus récente en premier. */
export function situations(lignes: LigneSituation[]): Situation[] {
  const drs = [...new Set(lignes.map((l) => l.dr))];
  return drs.map((dr) => {
    const mine = lignes.filter((l) => l.dr === dr);
    const date = mine.map((l) => l.date_rapport).sort().at(-1) as string;
    const l = mine.filter((x) => x.date_rapport === date);
    const ordreCentres: string[] = [];
    for (const x of [...l].sort((a, b) => a.ordre - b.ordre)) {
      if (["problemes", "produits_chimiques", "energie", "personnel"].includes(x.rubrique) && !ordreCentres.includes(x.centre)) ordreCentres.push(x.centre);
    }
    const centres = [...new Set(l.filter((x) => x.rubrique === "problemes").map((x) => x.centre))];
    const ordonne = <T,>(m: Map<string, T[]>) => [...m.entries()].map(([centre, lignes]) => ({ centre, lignes }));
    return {
      dr, date, source: l[0]?.source_document ?? "", centres: centres.length ? centres : ordreCentres,
      problemes: [...parCentre(l, "problemes", (d) => ({ probleme: String(d.probleme ?? ""), solution: String(d.solution ?? "") }))]
        .map(([centre, items]) => ({ centre, items })),
      chimiques: ordonne(parCentre<Chimique>(l, "produits_chimiques", (d) => ({
        designation: String(d.designation ?? ""), jour_kg: num(d.jour_kg), mois_kg: num(d.mois_kg), trimestre_kg: num(d.trimestre_kg),
        stock_kg: num(d.stock_kg),
      }))),
      energies: ordonne(parCentre<Energie>(l, "energie", (d) => ({
        source: txt(d.source), conso_horaire: txt(d.conso_horaire), temps: txt(d.temps),
        mensuelle_l: num(d.mensuelle_l), trimestre_l: num(d.trimestre_l), mensuelle_txt: txt(d.mensuelle_txt),
        stock_l: num(d.stock_l),
      }))),
      besoins: ordonne(parCentre<Besoin>(l, "personnel", (d) => ({
        profil: String(d.profil ?? ""), nombre: num(d.nombre) ?? 0, observation: txt(d.observation),
      }))),
      mobilier: ordonne(parCentre<Mobilier>(l, "mobilier", (d) => {
        const o = { beneficiaire: String(d.beneficiaire ?? "") } as Mobilier;
        for (const c of COLONNES_MOBILIER) (o as Record<string, unknown>)[c.cle] = num(d[c.cle]) ?? 0;
        return o;
      })),
      notes: l.filter((x) => x.rubrique === "notes").sort((a, b) => a.ordre - b.ordre).map((x) => ({ centre: x.centre, texte: String(x.donnees.texte ?? "") })),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

const somme = (v: (number | null)[]) => Math.round(v.reduce<number>((s, x) => s + (x ?? 0), 0) * 100) / 100;

export function totaux(s: Situation) {
  const chim = s.chimiques.flatMap((c) => c.lignes);
  const designations = [...new Set(chim.map((c) => c.designation))];
  const parProduit = designations.map((d) => {
    const l = chim.filter((c) => c.designation === d);
    return {
      designation: d, jour: somme(l.map((c) => c.jour_kg)), mois: somme(l.map((c) => c.mois_kg)), trimestre: somme(l.map((c) => c.trimestre_kg)),
      stock: l.some((c) => c.stock_kg !== null) ? somme(l.map((c) => c.stock_kg)) : null,
    };
  });
  const en = s.energies.flatMap((c) => c.lignes);
  const mobilier = s.mobilier.flatMap((c) => c.lignes);
  return {
    nbCentres: s.centres.length,
    nbProblemes: s.problemes.reduce((n, p) => n + p.items.length, 0),
    parProduit,
    carburantMois: somme(en.map((e) => e.mensuelle_l)),
    carburantTrimestre: somme(en.map((e) => e.trimestre_l)),
    carburantStock: en.some((e) => e.stock_l !== null) ? somme(en.map((e) => e.stock_l)) : null,
    postes: s.besoins.reduce((n, b) => n + b.lignes.reduce((m, x) => m + x.nombre, 0), 0),
    mobilierTotal: COLONNES_MOBILIER.map((c) => ({ ...c, total: mobilier.reduce((n, m) => n + m[c.cle], 0) })),
  };
}

/* ───────── Stocks et autonomie (v2) ───────── */

/** Un mois compte 30 jours, comme dans les fichiers des directions régionales (consommation du mois = jour × 30). */
export const JOURS_PAR_MOIS = 30;

export type Autonomie = {
  centre: string;
  libelle: string;
  nature: "produit" | "carburant";
  unite: "kg" | "L";
  stock: number;
  parJour: number;
  jours: number;
};

/** La situation contient-elle des stocks déclarés ? (N’Zérékoré : non ; Labé : oui) */
export function aDesStocks(s: Situation): boolean {
  return s.chimiques.some((c) => c.lignes.some((l) => l.stock_kg !== null)) || s.energies.some((c) => c.lignes.some((l) => l.stock_l !== null));
}

/** Consommation journalière de carburant d’un centre (groupes électrogènes), à partir du total mensuel déclaré. */
export function carburantParJour(lignes: Energie[]): number | null {
  const mois = lignes.reduce((n, l) => n + (l.mensuelle_l ?? 0), 0);
  return mois > 0 ? mois / JOURS_PAR_MOIS : null;
}

/** Autonomie de chaque stock déclaré = stock ÷ consommation journalière, du plus urgent au moins urgent.
 *  Un produit non consommé (ou un centre sur EDG seulement) n’a pas d’autonomie : il n’apparaît pas. */
export function autonomies(s: Situation): Autonomie[] {
  const out: Autonomie[] = [];
  for (const c of s.chimiques) {
    for (const l of c.lignes) {
      if (l.stock_kg === null) continue;
      const parJour = l.jour_kg ?? (l.mois_kg !== null ? l.mois_kg / JOURS_PAR_MOIS : null);
      if (!parJour || parJour <= 0) continue;
      const litres = /\(\s*l\s*\)/i.test(l.designation);
      out.push({
        centre: c.centre, libelle: l.designation.replace(/\s*\(\s*l\s*\)\s*/i, "").trim(), nature: "produit",
        unite: litres ? "L" : "kg", stock: l.stock_kg, parJour, jours: l.stock_kg / parJour,
      });
    }
  }
  for (const c of s.energies) {
    const stock = c.lignes.find((l) => l.stock_l !== null)?.stock_l ?? null;
    const parJour = carburantParJour(c.lignes);
    if (stock === null || parJour === null) continue;
    out.push({ centre: c.centre, libelle: "Carburant des groupes", nature: "carburant", unite: "L", stock, parJour, jours: stock / parJour });
  }
  return out.sort((a, b) => a.jours - b.jours);
}

/** « Épuisé », « ≈ 6 h », « ≈ 3 jours », « ≈ 4,6 mois ». */
export function libelleAutonomie(jours: number): string {
  if (jours <= 0) return "Épuisé";
  if (jours < 1) return `≈ ${Math.max(1, Math.round(jours * 24))} h`;
  if (jours < 60) {
    const j = Math.round(jours);
    return `≈ ${j} jour${j > 1 ? "s" : ""}`;
  }
  return `≈ ${(jours / JOURS_PAR_MOIS).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois`;
}

/** Niveau d’alerte : critique (moins d’un jour), alerte (moins d’une semaine), correct sinon. */
export function niveauAutonomie(jours: number): "critique" | "alerte" | "correct" {
  if (jours < 1) return "critique";
  if (jours < 7) return "alerte";
  return "correct";
}
