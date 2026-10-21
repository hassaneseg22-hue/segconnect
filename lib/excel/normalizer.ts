// =====================================================================
// lib/excel/normalizer.ts
// Normalisation des agences et des types de clients.
// La valeur d'origine du fichier est toujours conservée par l'appelant
// (champs source_*), ici on renvoie la forme canonique en base.
// =====================================================================

const AGENCY_ALIASES: Record<string, string> = {
  yimbaya: 'Yimbaya',
  matoto: 'Matoto',
  kountia: 'Kountia',
  'koun tai': 'Kountia',
  wanindara: 'Wanindara',
  cimenterie: 'Cimenterie',
  ratoma: 'Ratoma',
  dixinn: 'Dixinn',
  kaloum: 'Kaloum',
  matam: 'Matam',
};

const CLIENT_ALIASES: Record<string, string> = {
  particulier: 'Domestique',
  domestique: 'Domestique',
  'domestic': 'Domestique',
  commerce: 'Commerce',
  commercial: 'Commerce',
  industrie: 'Industrie',
  industriel: 'Industrie',
  admnistration: 'Administration',
  administration: 'Administration',
  'auters adm': 'Autres ADM',
  'autres adm': 'Autres ADM',
  'agent seg': 'Agent SEG',
  'installation seg': 'Installation SEG',
  'borne fontaine': 'Bornes Fontaines',
  'borne fontaines': 'Bornes Fontaines',
  'bornes fontaine': 'Bornes Fontaines',
  'bornes fontaines': 'Bornes Fontaines',
};

/** Débruite et banalise une chaîne pour les recherches d'aliase. */
export function slug(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[‘’'`]/g, "'")
    .trim();
}

/**
 * Renvoie le nom d'agence canonique.
 * Retourne `undefined` si la valeur ne correspond à aucune agence connue.
 */
export function normalizeAgency(value: unknown): string | undefined {
  const key = slug(value);
  if (!key) return undefined;
  if (AGENCY_ALIASES[key]) return AGENCY_ALIASES[key];
  // Casse-correcte exacte connue d'office.
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Permet de tester si une valeur est un nom d'agence reconnu.
 */
export function isAgencyKnown(value: unknown): boolean {
  return normalizeAgency(value) !== undefined;
}

/**
 * Renvoie le type de client canonique (alias → nom en base).
 * Retourne `undefined` si aucun alias ne correspond.
 */
export function normalizeClientType(value: unknown): string | undefined {
  const key = slug(value);
  if (!key) return undefined;
  if (CLIENT_ALIASES[key]) return CLIENT_ALIASES[key];
  // Dernier recours : capitaliser, utile si la base contient un libellé non listé.
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Nombre "sûr" : gère les formules cassées Excel (#REF!, #DIV/0!, "#N/A"),
 * les dates et le texte non numérique.
 */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return null; // une date n'est jamais un montant
  if (typeof value === 'boolean') return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^#(REF|DIV\/0|N\/A|NAME\?|VALUE|NULL)!?$/.test(s)) return null; // formule cassée
  return null; // texte non numérique → non traité comme montant
}

/**
 * Convertit une cellule de date possible.
 * Accepte une Date, un nombre (serial Excel) ou une chaîne 'YYYY-MM-DD'.
 * Renvoie 'YYYY-MM-01' ou null.
 */
export function toMonth(value: unknown): string | null {
  if (value instanceof Date) {
    const valid = !isNaN(value.getTime());
    return valid ? `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-01` : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial Excel (jours depuis 1900-01-00) → date
    const ms = Math.round((value - 25569) * 86400000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-01`;
  }
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  const m2 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-01`;
  return null;
}

/** Extraction de l'année (ex. 2026) depuis une date 'YYYY-MM-01'. */
export function yearOf(month: string): number {
  return Number(month.slice(0, 4));
}

/** Extraction du mois (1-12) depuis une date 'YYYY-MM-01'. */
export function monthOf(month: string): number {
  return Number(month.slice(5, 7));
}