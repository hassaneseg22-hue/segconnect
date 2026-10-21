// =====================================================================
// lib/excel/security.ts
// Contrôles de sécurité du fichier uploadé + empreinte SHA-256.
// =====================================================================

import { createHash } from 'crypto';

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo
export const ALLOWED_EXTENSIONS = ['xlsx', 'xls'];
const ALLOWED_MIME = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream'];

export interface FileSecurityCheck {
  ok: boolean;
  error?: string;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Valide extension, MIME et taille. N'exécute aucune macro (XLSX/XLS
 * sont des archives ; les macros .xlsm sont exclues d'office).
 */
export function checkFileSecurity(fileName: string, mimeType: string, size: number): FileSecurityCheck {
  const ext = extOf(fileName);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `Extension ".${ext || '(inconnue)'}" non prise en charge. Formats acceptés : .xlsx / .xls` };
  }
  if (mimeType && mimeType !== 'application/octet-stream' && !ALLOWED_MIME.includes(mimeType)) {
    return { ok: false, error: `Le type du fichier (${mimeType}) n'est pas un classeur Excel.` };
  }
  if (size <= 0) return { ok: false, error: 'Le fichier est vide.' };
  if (size > MAX_FILE_SIZE) return { ok: false, error: `Fichier trop volumineux (${(size / 1024 / 1024).toFixed(1)} Mo). Maximum autorisé : 20 Mo.` };
  return { ok: true };
}

/** Empreinte SHA-256 du contenu (détecte le dépôt du même fichier). */
export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}