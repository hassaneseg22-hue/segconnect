// =====================================================================
// lib/excel/parser.ts
// Extraction brute des données des feuilles BD_* d'un classeur XLSX.
// N'effectue aucune écriture DB : uniquement de la lecture mémoire.
// =====================================================================

import * as XLSX from 'xlsx';
import { ParsedWorkbook, ParsedSheet } from './types';
import { slug } from './normalizer';

// Configuration par feuille : nombre de lignes d'en-tête à sauter
// et liste des feuilles "BD_*" attendues.
const HEADER_SKIP: Record<string, number> = {
  BD_FAC: 3,
  BD_TECH: 1,
  BD_Recouv: 1,
};

export const BD_SHEETS = ['BD_FAC', 'BD_TECH', 'BD_Recouv'];

/** Détecte la première feuille "BD_*" du classeur, sans dépendre de la casse. */
export function findSheetName(workbook: XLSX.WorkBook, want: string): string | undefined {
  return workbook.SheetNames.find((n) => slug(n) === slug(want));
}

/** Lit une feuille en tableau brut de lignes (header=1). */
export function readSheetRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][];
}

/**
 * Analyse un fichier Excel en mémoire.
 * - buffer : contenu du fichier (Buffer / Uint8Array).
 * - fileName : nom d'origine (pour indication et déduction d'année).
 */
export function parseWorkbook(buffer: Buffer | Uint8Array, fileName: string): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheets: ParsedSheet[] = [];

  for (const sheet of BD_SHEETS) {
    const wsName = findSheetName(workbook, sheet);
    if (!wsName) {
      sheets.push({ name: sheet, rows: [] }); // feuille absente → ligne vide
      continue;
    }
    let rows = readSheetRows(workbook.Sheets[wsName]);
    const skip = HEADER_SKIP[sheet] || 0;
    rows = rows.slice(skip).filter((r) => r && r.some((c) => c !== null && c !== '' && c !== undefined));
    sheets.push({ name: sheet, rows });
  }

  // Année déduite du nom de fichier (BD_TECNICO_COMERCIALE_2026.xlsx), sinon année courante.
  const m = fileName.match(/20\d{2}/);
  const sourceYear = m ? Number(m[0]) : new Date().getFullYear();

  return {
    fileName,
    fileSize: 0, // renseigné par l'appelant
    fileHash: '', // renseigné par l'appelant
    sourceYear,
    sheets,
  };
}