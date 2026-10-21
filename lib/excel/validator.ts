// =====================================================================
// lib/excel/validator.ts
// Normalisation + validation des feuilles BD_*.
// Produit des enregistrements normalisés, une liste d'anomalies,
// les périodes/agences/types de clients détectés.
// =====================================================================

import { ParsedWorkbook, ValidationResult, FacNormalized, TechNormalized, RecNormalized, Anomaly } from './types';
import { normalizeAgency, normalizeClientType, toNum, toMonth, yearOf } from './normalizer';

const HEADER_SKIP: Record<string, number> = { BD_FAC: 3, BD_TECH: 1, BD_Recouv: 1 };
const MAX_ROWS_PER_SHEET = 200_000;

function periodLabel(month: string): string {
  const y = yearOf(month);
  const m = Number(month.slice(5, 7));
  const names = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  return `${names[(m - 1) % 12] ?? m} ${y}`;
}

function valOrSum(v: number | null, a: number | null, b: number | null): number | null {
  return v ?? (a !== null && b !== null ? a + b : null);
}

function safeRatio(num: number | null, den: number | null): number | null {
  if (den === null || den === 0 || num === null) return null;
  return num / den;
}

/**
 * Valide le classeur et renvoie les enregistrements normalisés + anomalies.
 * N'écrit rien en base.
 */
export function validateWorkbook(wb: ParsedWorkbook): ValidationResult {
  const fac: FacNormalized[] = [];
  const tech: TechNormalized[] = [];
  const rec: RecNormalized[] = [];
  const anomalies: Anomaly[] = [];
  const periods = new Set<string>();
  const agencies = new Set<string>();
  const clientTypes = new Set<string>();

  /** Renvoie les lignes brutes d'une feuille, indexées par leur n° de ligne réel. */
  const sheetRows = (name: string): Array<{ row: unknown[]; excelRow: number }> => {
    const s = wb.sheets.find((x) => x.name === name);
    if (!s) return [];
    const skip = HEADER_SKIP[s.name] || 0;
    return s.rows.slice(0, MAX_ROWS_PER_SHEET).map((row, i) => ({ row, excelRow: i + skip + 1 }));
  };

  // ---------- BD_FAC ----------
  for (const rec_ of sheetRows('BD_FAC')) {
    const row = rec_.row;
    const excelRow = rec_.excelRow;
    const period = toMonth(row[0]);
    const agencySrc = row[1];
    const clientSrc = row[2];
    if (period === null) {
      anomalies.push({ severity: 'warning', sheet: 'BD_FAC', excelRow, issueType: 'periode_invalide', message: 'Période (colonne A) illisible sur la ligne.', sourceValue: String(row[0] ?? '').slice(0, 120) });
      continue;
    }
    const agency = normalizeAgency(agencySrc);
    const clientType = normalizeClientType(clientSrc);
    if (!agency) {
      anomalies.push({ severity: 'warning', sheet: 'BD_FAC', excelRow, issueType: 'agence_inconnue', message: `Agence "${String(agencySrc ?? '').trim()}" non reconnue dans le référentiel.`, sourceValue: String(agencySrc ?? '').slice(0, 120) });
    }
    if (!clientType) {
      anomalies.push({ severity: 'warning', sheet: 'BD_FAC', excelRow, issueType: 'type_client_inconnu', message: `Type de client "${String(clientSrc ?? '').trim()}" non reconnu.`, sourceValue: String(clientSrc ?? '').slice(0, 120) });
    }
    if (!agency || !clientType) continue; // on ne crée pas de ligne sans clé valide

    const subF = toNum(row[3]);
    const subM = toNum(row[4]);
    const subTot = toNum(row[5]);
    const vcF = toNum(row[6]);
    const vfF = toNum(row[7]);
    const vcM = toNum(row[8]);
    const vfM = toNum(row[9]);
    const amtF = toNum(row[12]);
    const amtM = toNum(row[13]);
    const amtPenalty = toNum(row[15]);
    const amtPaid = toNum(row[16]);
    const balance = toNum(row[17]);
    const recovery = toNum(row[18]);

    const vcTot = valOrSum(toNum(row[10]), vcF, vcM);
    const vfTot = valOrSum(toNum(row[11]), vfF, vfM);
    const amtTot = valOrSum(toNum(row[14]), amtF, amtM);

    if (amtTot !== null && amtTot < 0) anomalies.push({ severity: 'warning', sheet: 'BD_FAC', excelRow, issueType: 'montant_negatif', message: `Montant total négatif (${amtTot}).`, sourceValue: String(amtTot) });
    if (vcTot !== null && vcTot < 0) anomalies.push({ severity: 'warning', sheet: 'BD_FAC', excelRow, issueType: 'consommation_negative', message: `Volume consommé négatif (${vcTot}).`, sourceValue: String(vcTot) });

    const key = `${period}:${agency}:${clientType}`;
    fac.push({
      key, period_month: period, agency, clientType,
      subscribers_forfait: subF, subscribers_mesure: subM, subscribers_total: valOrSum(subTot, subF, subM),
      volume_consume_forfait: vcF, volume_facture_forfait: vfF, volume_consume_mesure: vcM, volume_facture_mesure: vfM,
      volume_consume_total: vcTot, volume_facture_total: vfTot,
      amount_forfait: amtF, amount_mesure: amtM, amount_total: amtTot, amount_penalty: amtPenalty, amount_paid: amtPaid,
      balance_due: valOrSum(balance, amtPenalty, amtPaid !== null ? -amtPaid : null) ?? (amtPenalty !== null && amtPaid !== null ? amtPenalty - amtPaid : null),
      recovery_rate: recovery ?? safeRatio(amtPaid, amtPenalty),
      source_file: wb.fileName, source_row: excelRow,
    });
    periods.add(period);
    agencies.add(agency);
    clientTypes.add(clientType);
  }

  // ---------- BD_TECH ----------
  for (const rec_ of sheetRows('BD_TECH')) {
    const row = rec_.row;
    const excelRow = rec_.excelRow;
    const period = toMonth(row[0]);
    const agencySrc = row[1];
    if (period === null) {
      anomalies.push({ severity: 'warning', sheet: 'BD_TECH', excelRow, issueType: 'periode_invalide', message: 'Période (colonne A) illisible sur la ligne.', sourceValue: String(row[0] ?? '').slice(0, 120) });
      continue;
    }
    const agency = normalizeAgency(agencySrc);
    if (!agency) {
      anomalies.push({ severity: 'warning', sheet: 'BD_TECH', excelRow, issueType: 'agence_inconnue', message: `Agence "${String(agencySrc ?? '').trim()}" non reconnue dans le référentiel.`, sourceValue: String(agencySrc ?? '').slice(0, 120) });
      continue;
    }
    const produced = toNum(row[2]);
    const consumed = toNum(row[3]);
    const billedT = toNum(row[4]);
    const yieldRaw = toNum(row[5]);
    const ratioRaw = toNum(row[6]);
    const networkYield = yieldRaw ?? safeRatio(consumed, produced);
    const billingRatio = ratioRaw ?? safeRatio(billedT, produced);

    if (produced !== null && produced < 0) anomalies.push({ severity: 'warning', sheet: 'BD_TECH', excelRow, issueType: 'production_negative', message: `Production négative (${produced}).`, sourceValue: String(produced) });
    if (consumed !== null && consumed < 0) anomalies.push({ severity: 'warning', sheet: 'BD_TECH', excelRow, issueType: 'consommation_negative', message: `Consommation négative (${consumed}).`, sourceValue: String(consumed) });
    if (networkYield !== null && networkYield > 1) {
      anomalies.push({ severity: 'warning', sheet: 'BD_TECH', excelRow, issueType: 'rendement_superieur_100', message: `Rendement réseau supérieur à 100 % (${(networkYield * 100).toFixed(0)} %). Valeur conservée, à contrôler.`, sourceValue: String(networkYield) });
    }

    const key = `${period}:${agency}`;
    tech.push({ key, period_month: period, agency, volume_produced: produced, volume_consumed: consumed, volume_billed: billedT, network_yield: networkYield, billing_ratio: billingRatio, source_file: wb.fileName, source_row: excelRow });
    periods.add(period);
    agencies.add(agency);
  }

  // ---------- BD_Recouv ----------
  for (const rec_ of sheetRows('BD_Recouv')) {
    const row = rec_.row;
    const excelRow = rec_.excelRow;
    const period = toMonth(row[0]);
    const agencySrc = row[1];
    const clientSrc = row[2];
    if (period === null) {
      anomalies.push({ severity: 'warning', sheet: 'BD_Recouv', excelRow, issueType: 'periode_invalide', message: 'Période (colonne A) illisible sur la ligne.', sourceValue: String(row[0] ?? '').slice(0, 120) });
      continue;
    }
    const agency = normalizeAgency(agencySrc);
    const clientType = normalizeClientType(clientSrc);
    if (!agency) {
      anomalies.push({ severity: 'warning', sheet: 'BD_Recouv', excelRow, issueType: 'agence_inconnue', message: `Agence "${String(agencySrc ?? '').trim()}" non reconnue dans le référentiel.`, sourceValue: String(agencySrc ?? '').slice(0, 120) });
    }
    if (!clientType) {
      anomalies.push({ severity: 'warning', sheet: 'BD_Recouv', excelRow, issueType: 'type_client_inconnu', message: `Type de client "${String(clientSrc ?? '').trim()}" non reconnu.`, sourceValue: String(clientSrc ?? '').slice(0, 120) });
    }
    if (!agency || !clientType) continue;

    const amtF = toNum(row[3]);
    const amtM = toNum(row[4]);
    const amtPenalty = toNum(row[6]);
    const amtPaid = toNum(row[7]);
    const amtPaidUpd = toNum(row[9]);
    const recovery = toNum(row[11]) ?? safeRatio(amtPaid, amtPenalty);
    const amtTot = valOrSum(toNum(row[5]), amtF, amtM);
    const balance = valOrSum(toNum(row[8]), amtPenalty, amtPaid !== null ? -amtPaid : null) ?? (amtPenalty !== null && amtPaid !== null ? amtPenalty - amtPaid : null);
    const balanceUpd = toNum(row[10]) ?? (amtPenalty !== null && amtPaidUpd !== null ? amtPenalty - amtPaidUpd : null);
    const recoveryUpd = toNum(row[12]) ?? safeRatio(amtPaidUpd, amtPenalty);
    const evolution = toNum(row[13]) ?? (recoveryUpd !== null && recovery !== null ? recoveryUpd - recovery : null);

    if (amtTot !== null && amtTot < 0) anomalies.push({ severity: 'warning', sheet: 'BD_Recouv', excelRow, issueType: 'montant_negatif', message: `Montant total négatif (${amtTot}).`, sourceValue: String(amtTot) });

    const key = `${period}:${agency}:${clientType}`;
    rec.push({ key, period_month: period, agency, clientType, amount_forfait: amtF, amount_mesure: amtM, amount_total: amtTot, amount_penalty: amtPenalty, amount_paid: amtPaid, balance_due: balance, amount_paid_updated: amtPaidUpd, balance_due_updated: balanceUpd, recovery_rate: recovery, recovery_rate_updated: recoveryUpd, evolution, source_file: wb.fileName, source_row: excelRow });
    periods.add(period);
    agencies.add(agency);
    clientTypes.add(clientType);
  }

  const sortedPeriods = [...periods].sort();
  return {
    fac,
    tech,
    rec,
    anomalies,
    periods: sortedPeriods,
    agencies: [...agencies].sort(),
    clientTypes: [...clientTypes].sort(),
    counts: { fac: fac.length, tech: tech.length, rec: rec.length, total: fac.length + tech.length + rec.length },
  };
}

/** Libellés humains des périodes détectées. */
export function periodsLabels(periods: string[]): string[] {
  return periods.map(periodLabel);
}

export function shortPeriod(month: string): string {
  return `${yearOf(month)}-${String(Number(month.slice(5, 7))).padStart(2, '0')}`;
}
