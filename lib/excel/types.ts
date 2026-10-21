// =====================================================================
// lib/excel/types.ts
// Types partagés du pipeline d'import Excel SEG.
// =====================================================================

export const SHEET_NAMES = ['BD_FAC', 'BD_TECH', 'BD_Recouv'] as const;
export type SheetName = (typeof SHEET_NAMES)[number];

export type ImportAction = 'analyze' | 'import';

export type Severity = 'info' | 'warning' | 'critical';

export type IssueType =
  | 'agence_inconnue'
  | 'type_client_inconnu'
  | 'valeur_manquante'
  | 'doublon'
  | 'rendement_superieur_100'
  | 'rendement_anormal'
  | 'montant_negatif'
  | 'consommation_negative'
  | 'production_negative'
  | 'periode_invalide'
  | 'colonne_manquante'
  | 'format_incorrect'
  | 'formule_cassee'
  | 'ecart_import_attendu'
  | 'portion_annee'
  | 'systeme';

// Arc de structuration d'une anomalie.
export interface Anomaly {
  severity: Severity;
  sheet: string;
  excelRow: number;
  field?: string;
  issueType: IssueType;
  message: string;
  sourceValue?: string;
}

// Ligne facturation normalisée (BD_FAC).
export interface FacNormalized {
  key: string; // année-mois-agence-client
  period_month: string; // YYYY-MM-01
  agency: string;
  clientType: string;
  subscribers_forfait: number | null;
  subscribers_mesure: number | null;
  subscribers_total: number | null;
  volume_consume_forfait: number | null;
  volume_facture_forfait: number | null;
  volume_consume_mesure: number | null;
  volume_facture_mesure: number | null;
  volume_consume_total: number | null;
  volume_facture_total: number | null;
  amount_forfait: number | null;
  amount_mesure: number | null;
  amount_total: number | null;
  amount_penalty: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  recovery_rate: number | null;
  source_file: string;
  source_row: number;
}

// Ligne technique normalisée (BD_TECH).
export interface TechNormalized {
  key: string; // année-mois-agence
  period_month: string;
  agency: string;
  volume_produced: number | null;
  volume_consumed: number | null;
  volume_billed: number | null;
  network_yield: number | null;
  billing_ratio: number | null;
  source_file: string;
  source_row: number;
}

// Ligne recouvrement normalisée (BD_Recouv).
export interface RecNormalized {
  key: string; // année-mois-agence-client
  period_month: string;
  agency: string;
  clientType: string;
  amount_forfait: number | null;
  amount_mesure: number | null;
  amount_total: number | null;
  amount_penalty: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  amount_paid_updated: number | null;
  balance_due_updated: number | null;
  recovery_rate: number | null;
  recovery_rate_updated: number | null;
  evolution: number | null;
  source_file: string;
  source_row: number;
}

export interface ParsedSheet {
  name: string;
  rows: unknown[][]; // tableau brut (header=1) : chaque ligne est un tableau de cellules
}

export interface ParsedWorkbook {
  fileName: string;
  fileSize: number;
  fileHash: string;
  sourceYear: number; // année déduite (fichier / année la plus présente)
  sheets: ParsedSheet[];
}

export interface ValidationResult {
  fac: FacNormalized[];
  tech: TechNormalized[];
  rec: RecNormalized[];
  anomalies: Anomaly[];
  periods: string[]; // "YYYY-MM" triés
  agencies: string[]; // noms normalisés triés
  clientTypes: string[];
  counts: { fac: number; tech: number; rec: number; total: number };
}

// Résumé destiné à la prévisualisation avant import.
export interface AnalysisSummary extends ValidationResult {
  sheetDetected: { BD_FAC: boolean; BD_TECH: boolean; BD_Recouv: boolean };
  sheetRawCounts: { BD_FAC: number; BD_TECH: number; BD_Recouv: number };
  duplicateKeys: number;
  alreadyImported: boolean;
  existingImportId?: number;
  uncertainPeriods: boolean;
}

export interface ImportResult {
  importId: number;
  file_name: string;
  newRows: number;
  updatedRows: number;
  totalRows: number;
  anomaliesCount: number;
  status: 'validated' | 'partial' | 'failed';
}