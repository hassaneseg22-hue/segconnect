// lib/rh-effectif.ts
// Effectif de toute la société (liste du personnel par centre de frais) et rapprochement avec la liste des centres.
// Tout est calculé à partir des listes transmises ; rien n'est saisi à la main.
import type { Personne } from "@/lib/rh-agregat";

export type Agent = {
  rang: number;
  matricule: string;
  nom: string;
  prenom: string;
  emploi: string;
  categorie: string;
  cf: string;
  service: string;
  pole: string;
  alerte: string | null;
};

export const POLES = [
  "Direction générale et directions centrales",
  "Production, réseau, qualité et maintenance",
  "Études, projets et travaux",
  "Clientèle Conakry",
  "Clientèle intérieur",
] as const;

export const COULEUR_POLE: Record<string, string> = {
  "Direction générale et directions centrales": "#c084fc",
  "Production, réseau, qualité et maintenance": "#38bdf8",
  "Études, projets et travaux": "#f59e0b",
  "Clientèle Conakry": "#10b981",
  "Clientèle intérieur": "#f472b6",
};

/* ---------- Outils de comparaison ---------- */

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Clé de comparaison : sans accent, minuscules, uniquement des lettres (N’Zérékoré = N'Zérékoré). */
export const cle = (s: string) => {
  const k = sansAccent(s).toLowerCase().replace(/[^a-z]/g, "");
  return k === "telimele" ? "telemele" : k; // Télimélé / Télémélé : même centre, deux graphies
};
const mots = (s: string) =>
  sansAccent(s).toUpperCase().replace(/[’']/g, " ").split(/[^A-Z]+/).filter((m) => m.length >= 2);

/** Matricule en nombre ; une lettre O tapée à la place d'un zéro (« O970 ») est lue comme zéro. */
export function matriculeNum(m: string | null): number | null {
  if (!m) return null;
  const n = parseInt(m.trim().replace(/^[Oo]+/, (o) => "0".repeat(o.length)), 10);
  return Number.isFinite(n) ? n : null;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}
const memeMot = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && distance(a, b) <= 1);

/**
 * Vrai quand le nom de famille de la paie se retrouve (à une lettre près) dans le nom de la liste des centres.
 * Un prénom commun ne suffit pas : « Mohamed Youssouf BANGOURA » n'est pas « Youssouf Mohamed CAMARA ».
 */
export function nomsCompatibles(nomListe: string, agent: Agent): boolean {
  const a = mots(nomListe);
  const famille = mots(agent.nom);
  const b = famille.length ? famille : mots(`${agent.nom} ${agent.prenom}`);
  return a.some((x) => b.some((y) => memeMot(x, y)));
}

/** Région de la direction régionale (2 premiers chiffres du code du centre de frais de la paie). */
const REGION_DR: Record<string, string> = {
  boke: "71", kindia: "71", mamou: "72", labe: "72", kankan: "73", faranah: "74", nzerekore: "74",
};
export const NOM_REGION: Record<string, string> = {
  "71": "Basse Guinée", "72": "Moyenne Guinée", "73": "Haute Guinée", "74": "Guinée Forestière",
};
const regionAgent = (a: Agent) => a.cf.slice(1, 3);
const estIntérieur = (a: Agent) => a.cf >= "0700";
const estCentre = (a: Agent) => a.cf >= "0710" && a.cf.slice(3) !== "0";

/* ---------- Agrégats de la société ---------- */

export type Repartition = { libelle: string; n: number; part: number };

export function agreger(agents: Agent[], pole: string | null = null) {
  const sel = pole ? agents.filter((a) => a.pole === pole) : agents;
  const compter = (cleFn: (a: Agent) => string): Repartition[] => {
    const m = new Map<string, number>();
    for (const a of sel) m.set(cleFn(a), (m.get(cleFn(a)) ?? 0) + 1);
    return [...m.entries()]
      .map(([libelle, n]) => ({ libelle, n, part: sel.length ? n / sel.length : 0 }))
      .sort((x, y) => y.n - x.n || x.libelle.localeCompare(y.libelle, "fr"));
  };
  const services = new Map<string, { cf: string; service: string; n: number }>();
  for (const a of sel) {
    const s = services.get(a.cf) ?? { cf: a.cf, service: a.service, n: 0 };
    s.n += 1;
    services.set(a.cf, s);
  }
  return {
    total: sel.length,
    poles: POLES.map((p) => {
      const n = agents.filter((a) => a.pole === p).length;
      return { pole: p, n, part: agents.length ? n / agents.length : 0 };
    }),
    nbServices: services.size,
    services: [...services.values()].sort((x, y) => y.n - x.n || x.cf.localeCompare(y.cf)),
    fonctions: compter((a) => a.categorie),
  };
}

export function verifierEffectif(agents: Agent[]) {
  return {
    alertes: agents.filter((a) => a.alerte).sort((a, b) => a.rang - b.rang),
    anciens: agents.filter((a) => a.categorie.startsWith("Ancien titulaire")).sort((a, b) => a.rang - b.rang),
  };
}

/* ---------- Rapprochement avec la liste des centres (septembre) ---------- */

export type Couple = { p: Personne; agent: Agent };
export type EcartRegion = { code: string; region: string; liste: number; paie: number; ecart: number };
export type EcartCentre = { centre: string; liste: number; paie: number; ecart: number };

export function rapprocher(agents: Agent[], centres: Personne[]) {
  const parMle = new Map<number, Agent>();
  for (const a of agents) {
    const n = matriculeNum(a.matricule);
    if (n !== null) parMle.set(n, a);
  }

  const retrouves: Couple[] = [];
  const nomDifferent: Couple[] = [];
  const affectationDifferente: Couple[] = [];
  const absentsPaie: Personne[] = [];

  for (const p of centres) {
    const n = matriculeNum(p.matricule);
    const agent = n === null ? undefined : parMle.get(n);
    if (!agent) { absentsPaie.push(p); continue; }
    if (!nomsCompatibles(p.nom, agent)) { nomDifferent.push({ p, agent }); continue; }
    retrouves.push({ p, agent });

    const regionListe = REGION_DR[cle(p.dr)];
    let diff: boolean;
    if (!estIntérieur(agent)) diff = true;
    else if (p.estStaffDr) diff = regionAgent(agent) !== regionListe;
    else if (estCentre(agent)) diff = cle(agent.service) !== cle(p.centre);
    else diff = regionAgent(agent) !== regionListe; // rattaché à la direction régionale dans la paie
    if (diff) affectationDifferente.push({ p, agent });
  }

  // Effectifs comparés par région, avec la même géographie dans les deux listes : celle des centres de frais.
  // Un centre est rangé dans la région de son CF (Koundara et Gaoual : Moyenne Guinée ; Dabola et Dinguiraye : Haute Guinée),
  // même si la liste des centres le place sous une autre direction régionale. Le personnel des DR suit la région de sa DR.
  const regionCentre = new Map<string, string>();
  for (const a of agents) if (estCentre(a)) regionCentre.set(cle(a.service), regionAgent(a));
  const regionListe = (p: Personne) =>
    (!p.estStaffDr && regionCentre.get(cle(p.centre))) || REGION_DR[cle(p.dr)];
  const regions: EcartRegion[] = Object.keys(NOM_REGION).map((code) => {
    const liste = centres.filter((p) => regionListe(p) === code).length;
    const paie = agents.filter((a) => estIntérieur(a) && a.cf >= "0710" && regionAgent(a) === code).length;
    return { code, region: NOM_REGION[code], liste, paie, ecart: paie - liste };
  });

  // Détail par centre (hors direction régionale)
  const noms = new Map<string, EcartCentre>();
  for (const p of centres) {
    if (p.estStaffDr) continue;
    const k = cle(p.centre);
    const e = noms.get(k) ?? { centre: p.centre, liste: 0, paie: 0, ecart: 0 };
    e.liste += 1;
    noms.set(k, e);
  }
  for (const a of agents) {
    if (!estCentre(a)) continue;
    const k = cle(a.service);
    const e = noms.get(k) ?? { centre: a.service, liste: 0, paie: 0, ecart: 0 };
    e.paie += 1;
    noms.set(k, e);
  }
  const parCentre = [...noms.values()]
    .map((e) => ({ ...e, ecart: e.paie - e.liste }))
    .sort((x, y) => y.ecart - x.ecart || x.centre.localeCompare(y.centre, "fr"));

  const totalListe = regions.reduce((s, r) => s + r.liste, 0);
  const totalPaie = regions.reduce((s, r) => s + r.paie, 0);
  return {
    nbListe: centres.length,
    retrouves, nomDifferent, affectationDifferente, absentsPaie,
    regions, totalListe, totalPaie, parCentre,
    nbAConfirmer: nomDifferent.length + affectationDifferente.length + absentsPaie.length,
    // Retrouvés + non retrouvés = liste des centres ; les affectations différentes font partie des retrouvés.
    nbNonRetrouves: nomDifferent.length + absentsPaie.length,
  };
}

/* ---------- Contrôle des matricules de la liste des centres (affiché dans « Matricules en double ») ---------- */

export type EtatControle = "concorde" | "autre" | "absent";
export type Controle = {
  total: number;
  concordent: number;
  statut: Record<number, { etat: EtatControle; agent?: Agent }>;
  parDr: { dr: string; total: number; concordent: number }[];
};

/** Pour chaque agent de la liste des centres : le matricule et le nom se retrouvent-ils dans la liste du personnel ? */
export function controler(agents: Agent[], centres: Personne[]): Controle {
  const r = rapprocher(agents, centres);
  const statut: Controle["statut"] = {};
  for (const { p, agent } of r.retrouves) statut[p.rang] = { etat: "concorde", agent };
  for (const { p, agent } of r.nomDifferent) statut[p.rang] = { etat: "autre", agent };
  for (const p of r.absentsPaie) statut[p.rang] = { etat: "absent" };
  const ordre: string[] = [];
  for (const p of [...centres].sort((a, b) => a.rang - b.rang)) if (!ordre.includes(p.dr)) ordre.push(p.dr);
  return {
    total: centres.length,
    concordent: r.retrouves.length,
    statut,
    parDr: ordre.map((dr) => {
      const l = centres.filter((p) => p.dr === dr);
      return { dr, total: l.length, concordent: l.filter((p) => statut[p.rang]?.etat === "concorde").length };
    }),
  };
}
