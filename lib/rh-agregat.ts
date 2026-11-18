// lib/rh-agregat.ts
// Calculs de la page Ressources humaines : tout est dérivé de la liste transmise, rien n'est saisi à la main.

export const ORDRE_CATEGORIES = [
  "Directeur régional",
  "Chef de service technique",
  "Chef de centre",
  "Facturier",
  "Caissier(ère)",
  "Agent de zone",
  "Agent de station",
  "Plombier",
] as const;
export type Categorie = (typeof ORDRE_CATEGORIES)[number];

export const COULEUR: Record<Categorie, string> = {
  "Directeur régional": "#c084fc",
  "Chef de service technique": "#818cf8",
  "Chef de centre": "#38bdf8",
  "Facturier": "#f59e0b",
  "Caissier(ère)": "#fb923c",
  "Agent de zone": "#10b981",
  "Agent de station": "#06b6d4",
  "Plombier": "#f472b6",
};

export const LIBELLE: Record<Categorie, [string, string]> = {
  "Directeur régional": ["directeur régional", "directeurs régionaux"],
  "Chef de service technique": ["chef de service technique", "chefs de service technique"],
  "Chef de centre": ["chef de centre", "chefs de centre"],
  "Facturier": ["facturier", "facturiers"],
  "Caissier(ère)": ["caissier(ère)", "caissiers(ères)"],
  "Agent de zone": ["agent de zone", "agents de zone"],
  "Agent de station": ["agent de station", "agents de station"],
  "Plombier": ["plombier", "plombiers"],
};

export type Personne = {
  rang: number;
  dr: string;
  centre: string;
  estStaffDr: boolean;
  nom: string;
  matricule: string | null;
  fonction: string;
  categorie: Categorie;
  contact: string | null;
  alerte: string | null;
};

export type Centre = {
  nom: string;
  dr: string;
  effectif: number;
  chef: Personne | null;
  membres: Personne[];
  composition: Partial<Record<Categorie, number>>;
};

export type Direction = {
  dr: string;
  total: number;
  directeur: Personne | null;
  staff: Personne[]; // personnel de la direction régionale, hors directeur
  centres: Centre[];
};

const rangCat = (c: Categorie) => ORDRE_CATEGORIES.indexOf(c);
const trier = (a: Personne, b: Personne) => rangCat(a.categorie) - rangCat(b.categorie) || a.rang - b.rang;

export function agreger(personnes: Personne[]) {
  const ordreDr: string[] = [];
  for (const p of [...personnes].sort((a, b) => a.rang - b.rang)) if (!ordreDr.includes(p.dr)) ordreDr.push(p.dr);

  const directions: Direction[] = ordreDr.map((dr) => {
    const gens = personnes.filter((p) => p.dr === dr);
    const staffTout = gens.filter((p) => p.estStaffDr).sort(trier);
    const noms = [...new Set(gens.filter((p) => !p.estStaffDr).sort((a, b) => a.rang - b.rang).map((p) => p.centre))];
    const centres: Centre[] = noms.map((nom) => {
      const membres = gens.filter((p) => !p.estStaffDr && p.centre === nom).sort(trier);
      const composition: Centre["composition"] = {};
      for (const m of membres) composition[m.categorie] = (composition[m.categorie] ?? 0) + 1;
      return {
        nom, dr, effectif: membres.length, membres, composition,
        chef: membres.find((m) => m.categorie === "Chef de centre") ?? null,
      };
    });
    return {
      dr, total: gens.length,
      directeur: staffTout.find((p) => p.categorie === "Directeur régional") ?? null,
      staff: staffTout.filter((p) => p.categorie !== "Directeur régional"),
      centres,
    };
  });

  const centres = directions.flatMap((d) => d.centres);
  const enDr = personnes.filter((p) => p.estStaffDr).length;
  const enCentres = personnes.length - enDr;

  const fonctions = ORDRE_CATEGORIES.map((categorie) => {
    const n = personnes.filter((p) => p.categorie === categorie).length;
    return { categorie, n, part: personnes.length ? n / personnes.length : 0 };
  }).sort((a, b) => b.n - a.n);

  const sans = (c: Categorie) => centres.filter((x) => !x.composition[c]);
  const vigilance = {
    petitsEffectifs: centres.filter((c) => c.effectif <= 2).sort((a, b) => a.effectif - b.effectif),
    sansChef: sans("Chef de centre"),
    sansPlombier: sans("Plombier"),
    sansAgentZone: sans("Agent de zone"),
    sansAgentStation: sans("Agent de station"),
    avecCaisse: centres.filter((c) => c.composition["Caissier(ère)"]),
    avecFacturier: centres.filter((c) => c.composition["Facturier"]),
  };

  return {
    total: personnes.length,
    enDr, enCentres,
    nbDr: directions.length,
    nbCentres: centres.length,
    moyenneParCentre: centres.length ? enCentres / centres.length : 0,
    fonctions, directions, centres, vigilance,
    alertes: personnes.filter((p) => p.alerte).sort((a, b) => a.rang - b.rang),
  };
}

/* ===================================================================== */
/* Contrôle qualité de la liste transmise (présenté au DG)                */
/* ===================================================================== */

export type CleVerif =
  | "matricule-double" | "matricule-invalide" | "contact-absent"
  | "contact-invalide" | "nom-invalide" | "rang-manquant";
export type Priorite = "haute" | "moyenne" | "faible";

export type ElementVerif = {
  titre?: string;
  detail?: string;
  lignes: { p: Personne; valeur?: string }[];
};
export type GroupeVerif = {
  cle: CleVerif;
  titre: string;
  priorite: Priorite;
  pourquoi: string;
  action: string;
  remarque?: string;
  elements: ElementVerif[];
  nbAgents: number; // agents concernés (0 pour les numéros d'ordre manquants)
};

const TEXTES: Record<CleVerif, { titre: string; priorite: Priorite; pourquoi: string; action: string }> = {
  "matricule-double": {
    titre: "Matricules en double", priorite: "haute",
    pourquoi: "Le matricule doit être unique pour chaque agent. Un même numéro attribué à deux personnes peut créer des confusions dans les dossiers.",
    action: "Faire confirmer le bon matricule de chaque agent par les directions régionales concernées.",
  },
  "matricule-invalide": {
    titre: "Matricule absent ou mal saisi", priorite: "haute",
    pourquoi: "Sans matricule fiable (absent, ou contenant une lettre), l’agent ne peut pas être identifié de façon sûre.",
    action: "Faire compléter ou corriger le matricule.",
  },
  "contact-absent": {
    titre: "Contact non renseigné", priorite: "moyenne",
    pourquoi: "Ces agents ne peuvent pas être joints à partir de la liste.",
    action: "Faire transmettre un numéro de téléphone pour chacun.",
  },
  "contact-invalide": {
    titre: "Contact mal saisi ou partagé", priorite: "moyenne",
    pourquoi: "Le numéro contient une lettre à la place d’un zéro, n’a pas 9 chiffres, ou est donné à deux agents différents : il est à confirmer.",
    action: "Faire confirmer le numéro de chaque agent concerné.",
  },
  "rang-manquant": {
    titre: "Numéro d’ordre manquant", priorite: "moyenne",
    pourquoi: "Un numéro manque dans la numérotation de la liste : un agent a peut-être été oublié.",
    action: "Demander à la DCCCI si une ligne a été omise.",
  },
  "nom-invalide": {
    titre: "Nom à corriger", priorite: "faible",
    pourquoi: "Le nom contient un chiffre, probablement une erreur de frappe.",
    action: "Faire confirmer l’orthographe du nom.",
  },
};
const ORDRE_PRIORITE: Record<Priorite, number> = { haute: 0, moyenne: 1, faible: 2 };

export function verifier(personnes: Personne[]) {
  const chiffres = (c: string) => c.replace(/\s/g, "");
  const parRang = [...personnes].sort((a, b) => a.rang - b.rang);

  const groupes: Record<CleVerif, ElementVerif[]> = {
    "matricule-double": [], "matricule-invalide": [], "contact-absent": [],
    "contact-invalide": [], "nom-invalide": [], "rang-manquant": [],
  };

  // Matricules
  const parMatricule = new Map<string, Personne[]>();
  for (const p of parRang) {
    if (!p.matricule) groupes["matricule-invalide"].push({ lignes: [{ p, valeur: "non renseigné" }] });
    else if (!/^\d{4}$/.test(p.matricule)) groupes["matricule-invalide"].push({ lignes: [{ p, valeur: p.matricule }] });
    else parMatricule.set(p.matricule, [...(parMatricule.get(p.matricule) ?? []), p]);
  }
  for (const [m, l] of [...parMatricule.entries()].sort()) {
    if (l.length > 1) groupes["matricule-double"].push({ titre: `Matricule ${m}`, lignes: l.map((p) => ({ p })) });
  }

  // Contacts
  const parNumero = new Map<string, Personne[]>();
  for (const p of parRang) {
    if (!p.contact) { groupes["contact-absent"].push({ lignes: [{ p, valeur: "non renseigné" }] }); continue; }
    const d = chiffres(p.contact);
    if (/^\d{9}$/.test(d)) parNumero.set(d, [...(parNumero.get(d) ?? []), p]);
    else groupes["contact-invalide"].push({ lignes: [{ p, valeur: p.contact }] });
  }
  for (const [, l] of parNumero) {
    if (l.length > 1) groupes["contact-invalide"].push({
      titre: `Numéro ${l[0].contact} donné à ${l.length} agents`, lignes: l.map((p) => ({ p })),
    });
  }

  // Noms
  for (const p of parRang) if (/\d/.test(p.nom)) groupes["nom-invalide"].push({ lignes: [{ p, valeur: p.nom }] });

  // Numéros d'ordre manquants
  const rangsManquants: { rang: number; avant: Personne; apres: Personne }[] = [];
  if (parRang.length) {
    const presents = new Set(parRang.map((p) => p.rang));
    for (let r = parRang[0].rang; r <= parRang[parRang.length - 1].rang; r++) {
      if (presents.has(r)) continue;
      const avant = [...parRang].reverse().find((p) => p.rang < r)!;
      const apres = parRang.find((p) => p.rang > r)!;
      rangsManquants.push({ rang: r, avant, apres });
      groupes["rang-manquant"].push({
        titre: `N° ${r} absent de la liste`,
        detail: `La numérotation passe du n° ${avant.rang} au n° ${apres.rang}, dans la direction régionale de ${avant.dr}.`,
        lignes: [{ p: avant, valeur: `n° ${avant.rang}` }, { p: apres, valeur: `n° ${apres.rang}` }],
      });
    }
  }

  const liste: GroupeVerif[] = (Object.keys(groupes) as CleVerif[])
    .filter((cle) => groupes[cle].length > 0)
    .map((cle) => {
      const elements = groupes[cle];
      const agents = new Set(elements.flatMap((e) => e.lignes.map((l) => l.p.rang)));
      const g: GroupeVerif = { cle, ...TEXTES[cle], elements, nbAgents: cle === "rang-manquant" ? 0 : agents.size };
      if (cle === "contact-absent") {
        const chefs = elements.flatMap((e) => e.lignes.map((l) => l.p)).filter((p) => p.categorie === "Chef de centre");
        if (chefs.length) g.remarque = chefs.length === 1
          ? `Parmi eux, le chef du centre de ${chefs[0].centre}.`
          : `Parmi eux, ${chefs.length} chefs de centre (${chefs.map((c) => c.centre).join(", ")}).`;
      }
      return g;
    })
    .sort((a, b) => ORDRE_PRIORITE[a.priorite] - ORDRE_PRIORITE[b.priorite] || (b.nbAgents || b.elements.length) - (a.nbAgents || a.elements.length));

  // Agents concernés (comptés une seule fois) et répartition par direction régionale
  const concernes = new Map<number, Personne>();
  for (const g of liste) if (g.cle !== "rang-manquant")
    for (const e of g.elements) for (const l of e.lignes) concernes.set(l.p.rang, l.p);

  const parDr = new Map<string, { agents: number; lignesManquantes: number }>();
  for (const p of concernes.values()) {
    const x = parDr.get(p.dr) ?? { agents: 0, lignesManquantes: 0 };
    x.agents += 1; parDr.set(p.dr, x);
  }
  for (const m of rangsManquants) {
    const x = parDr.get(m.avant.dr) ?? { agents: 0, lignesManquantes: 0 };
    x.lignesManquantes += 1; parDr.set(m.avant.dr, x);
  }

  return {
    groupes: liste,
    agentsConcernes: concernes.size,
    rangsManquants,
    parDr: [...parDr.entries()]
      .map(([dr, x]) => ({ dr, ...x, total: x.agents + x.lignesManquantes }))
      .sort((a, b) => b.total - a.total || a.dr.localeCompare(b.dr, "fr")),
  };
}
