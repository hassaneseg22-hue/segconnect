// components/facturation/format.ts
export const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const fr1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fr0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 126 432 000 000 → "126,4 Md" ; 845 000 000 → "845 M" */
export function gnf(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${fr1.format(v / 1e9)} Md`;
  if (a >= 1e6) return `${fr0.format(v / 1e6)} M`;
  return fr0.format(v);
}
/** m³ : 21 475 653 → "21,5 M" */
export function m3(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${fr1.format(v / 1e6)} M`;
  if (a >= 1e3) return `${fr0.format(v / 1e3)} k`;
  return fr0.format(v);
}
export const entier = (v: number) => fr0.format(v);
export const pct = (v: number) => `${fr1.format(v * 100)} %`;

export function plageMois(dernier?: number) {
  if (!dernier) return "aucune donnée";
  return dernier === 1 ? "janvier" : `janvier à ${MOIS_LONG[dernier - 1]}`;
}

export type Facturation = {
  filtres: { annee: number; zone: string; periode: "cumul" | "S1" | "S2" };
  maj: string;
  couverture: Record<string, number>;
  kpis: {
    ca_ttc: number; ca_ht: number; agences_sans_ht: string[];
    volume_facture: number; volume_consomme: number; prix_moyen_ttc: number;
    nb_agences: number; nb_alertes: number;
  };
  mensuel: { mois: number; conakry: number; interieur: number; volume: number }[];
  agences: { agence: string; zone: string; ca_ttc: number; volume_facture: number; part: number; dernier_mois: number; alertes: number }[];
  categories: { categorie: string; ca_ttc: number; volume_facture: number; part: number; prix_moyen: number }[];
  alertes: { agence: string; zone: string; mois: number; categorie: string; message: string }[];
};
