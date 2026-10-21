import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  FacNormalized,
  TechNormalized,
  RecNormalized,
  Anomaly,
  ImportResult,
} from './types';
import { yearOf } from './normalizer';

const toDb = (v: number | null) => (v === null ? null : v);

type AgencyMap = Map<string, number>;
type ClientTypeMap = Map<string, number>;

function normalizeName(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Charge les référentiels Supabase nécessaires à l'import.
 */
async function loadReferences(): Promise<{
  agencies: AgencyMap;
  clientTypes: ClientTypeMap;
}> {
  const [
    { data: agencies, error: agenciesError },
    { data: clientTypes, error: clientTypesError },
  ] = await Promise.all([
    supabaseAdmin
      .from('agencies')
      .select('id, name'),

    supabaseAdmin
      .from('client_types')
      .select('id, name'),
  ]);

  if (agenciesError) throw agenciesError;
  if (clientTypesError) throw clientTypesError;

  const agencyMap: AgencyMap = new Map();
  const clientTypeMap: ClientTypeMap = new Map();

  for (const agency of agencies ?? []) {
    agencyMap.set(normalizeName(agency.name), Number(agency.id));
  }

  for (const clientType of clientTypes ?? []) {
    clientTypeMap.set(normalizeName(clientType.name), Number(clientType.id));
  }

  return {
    agencies: agencyMap,
    clientTypes: clientTypeMap,
  };
}

/**
 * Vérifie si une ligne existe déjà avant l'upsert.
 * Permet de conserver les compteurs newRows / updatedRows.
 */
async function existingFac(
  r: FacNormalized,
  refs: { agencies: AgencyMap; clientTypes: ClientTypeMap }
): Promise<boolean> {
  const agencyId = refs.agencies.get(normalizeName(r.agency));
  const clientTypeId = refs.clientTypes.get(normalizeName(r.clientType));

  if (!agencyId || !clientTypeId) return false;

  const { data, error } = await supabaseAdmin
    .from('facturation_monthly')
    .select('id')
    .eq('period_month', r.period_month)
    .eq('agency_id', agencyId)
    .eq('client_type_id', clientTypeId)
    .maybeSingle();

  if (error) throw error;

  return data !== null;
}

async function existingTech(
  r: TechNormalized,
  refs: { agencies: AgencyMap; clientTypes: ClientTypeMap }
): Promise<boolean> {
  const agencyId = refs.agencies.get(normalizeName(r.agency));

  if (!agencyId) return false;

  const { data, error } = await supabaseAdmin
    .from('technique_monthly')
    .select('id')
    .eq('period_month', r.period_month)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (error) throw error;

  return data !== null;
}

async function existingRec(
  r: RecNormalized,
  refs: { agencies: AgencyMap; clientTypes: ClientTypeMap }
): Promise<boolean> {
  const agencyId = refs.agencies.get(normalizeName(r.agency));
  const clientTypeId = refs.clientTypes.get(normalizeName(r.clientType));

  if (!agencyId || !clientTypeId) return false;

  const { data, error } = await supabaseAdmin
    .from('recouvrement_monthly')
    .select('id')
    .eq('period_month', r.period_month)
    .eq('agency_id', agencyId)
    .eq('client_type_id', clientTypeId)
    .maybeSingle();

  if (error) throw error;

  return data !== null;
}

/**
 * INSERT / UPDATE facturation_monthly
 */
async function upsertFac(
  r: FacNormalized,
  importId: number,
  fileName: string,
  refs: { agencies: AgencyMap; clientTypes: ClientTypeMap }
): Promise<boolean> {
  const agencyId = refs.agencies.get(normalizeName(r.agency));
  const clientTypeId = refs.clientTypes.get(normalizeName(r.clientType));

  if (!agencyId) {
    throw new Error(`Agence introuvable dans Supabase : "${r.agency}"`);
  }

  if (!clientTypeId) {
    throw new Error(
      `Type de client introuvable dans Supabase : "${r.clientType}"`
    );
  }

  const existed = await existingFac(r, refs);

  const payload = {
    import_id: importId,
    period_month: r.period_month,
    agency_id: agencyId,
    client_type_id: clientTypeId,

    subscribers_forfait: toDb(r.subscribers_forfait),
    subscribers_mesure: toDb(r.subscribers_mesure),
    subscribers_total: toDb(r.subscribers_total),

    volume_consume_forfait: toDb(r.volume_consume_forfait),
    volume_facture_forfait: toDb(r.volume_facture_forfait),
    volume_consume_mesure: toDb(r.volume_consume_mesure),
    volume_facture_mesure: toDb(r.volume_facture_mesure),

    volume_consume_total: toDb(r.volume_consume_total),
    volume_facture_total: toDb(r.volume_facture_total),

    amount_forfait: toDb(r.amount_forfait),
    amount_mesure: toDb(r.amount_mesure),
    amount_total: toDb(r.amount_total),
    amount_penalty: toDb(r.amount_penalty),
    amount_paid: toDb(r.amount_paid),
    balance_due: toDb(r.balance_due),
    recovery_rate: toDb(r.recovery_rate),

    source_file: fileName,
    source_row: r.source_row,
  };

  const { error } = await supabaseAdmin
    .from('facturation_monthly')
    .upsert(payload, {
      onConflict: 'period_month,agency_id,client_type_id',
    });

  if (error) throw error;

  return !existed;
}

/**
 * INSERT / UPDATE technique_monthly
 */
async function upsertTech(
  r: TechNormalized,
  importId: number,
  fileName: string,
  refs: { agencies: AgencyMap; clientTypes: ClientTypeMap }
): Promise<boolean> {
  const agencyId = refs.agencies.get(normalizeName(r.agency));

  if (!agencyId) {
    throw new Error(`Agence introuvable dans Supabase : "${r.agency}"`);
  }

  const existed = await existingTech(r, refs);

  const payload = {
    import_id: importId,
    period_month: r.period_month,
    agency_id: agencyId,

    volume_produced: toDb(r.volume_produced),
    volume_consumed: toDb(r.volume_consumed),
    volume_billed: toDb(r.volume_billed),
    network_yield: toDb(r.network_yield),
    billing_ratio: toDb(r.billing_ratio),

    source_file: fileName,
    source_row: r.source_row,
  };

  const { error } = await supabaseAdmin
    .from('technique_monthly')
    .upsert(payload, {
      onConflict: 'period_month,agency_id',
    });

  if (error) throw error;

  return !existed;
}

/**
 * INSERT / UPDATE recouvrement_monthly
 */
async function upsertRec(
  r: RecNormalized,
  importId: number,
  fileName: string,
  refs: { agencies: AgencyMap; clientTypes: ClientTypeMap }
): Promise<boolean> {
  const agencyId = refs.agencies.get(normalizeName(r.agency));
  const clientTypeId = refs.clientTypes.get(normalizeName(r.clientType));

  if (!agencyId) {
    throw new Error(`Agence introuvable dans Supabase : "${r.agency}"`);
  }

  if (!clientTypeId) {
    throw new Error(
      `Type de client introuvable dans Supabase : "${r.clientType}"`
    );
  }

  const existed = await existingRec(r, refs);

  const payload = {
    import_id: importId,
    period_month: r.period_month,
    agency_id: agencyId,
    client_type_id: clientTypeId,

    amount_forfait: toDb(r.amount_forfait),
    amount_mesure: toDb(r.amount_mesure),
    amount_total: toDb(r.amount_total),
    amount_penalty: toDb(r.amount_penalty),
    amount_paid: toDb(r.amount_paid),
    balance_due: toDb(r.balance_due),

    amount_paid_updated: toDb(r.amount_paid_updated),
    balance_due_updated: toDb(r.balance_due_updated),

    recovery_rate: toDb(r.recovery_rate),
    recovery_rate_updated: toDb(r.recovery_rate_updated),
    evolution: toDb(r.evolution),

    source_file: fileName,
    source_row: r.source_row,
  };

  const { error } = await supabaseAdmin
    .from('recouvrement_monthly')
    .upsert(payload, {
      onConflict: 'period_month,agency_id,client_type_id',
    });

  if (error) throw error;

  return !existed;
}

/**
 * Importe les données validées vers Supabase.
 *
 * NOTE :
 * Supabase REST ne fournit pas ici une transaction multi-requêtes
 * équivalente à BEGIN/COMMIT MySQL.
 *
 * L'ordre est donc :
 * 1. création de data_imports
 * 2. insertion/upsert des données
 * 3. anomalies
 * 4. mise à jour du statut
 *
 * En cas d'erreur, l'import est marqué failed lorsque possible.
 */
export async function importValidated(
  v: {
    fac: FacNormalized[];
    tech: TechNormalized[];
    rec: RecNormalized[];
    anomalies: Anomaly[];
    periods: string[];
  },
  meta: {
    fileName: string;
    fileSize: number;
    fileHash: string;
    sourceYear: number;
    importType: string;
    userName?: string;
    mode: 'import' | 'reimport';
  }
): Promise<ImportResult> {
  let importId: number | null = null;

  let newRows = 0;
  let updatedRows = 0;

  try {
    const refs = await loadReferences();

    const periodStart =
      v.periods.length > 0 ? v.periods[0] : null;

    const periodEnd =
      v.periods.length > 0
        ? v.periods[v.periods.length - 1]
        : null;

    /**
     * Création de l'historique d'import.
     */
    const { data: importRow, error: importError } =
      await supabaseAdmin
        .from('data_imports')
        .insert({
          file_name: meta.fileName,
          file_hash: meta.fileHash,
          file_size: meta.fileSize,
          source_year: meta.sourceYear,
          period_start: periodStart,
          period_end: periodEnd,
          import_type: meta.importType,
          status: 'validated',
          rows_count:
            v.fac.length +
            v.tech.length +
            v.rec.length,
          rows_new: 0,
          rows_updated: 0,
          anomalies_count: v.anomalies.length,
          user_name: meta.userName ?? null,
          metadata: {
            mode: meta.mode,
            sheets: {
              BD_FAC: v.fac.length,
              BD_TECH: v.tech.length,
              BD_Recouv: v.rec.length,
            },
          },
        })
        .select('id')
        .single();

    if (importError) throw importError;

    importId = Number(importRow.id);

    /**
     * Facturation.
     */
    for (const r of v.fac) {
      const inserted = await upsertFac(
        r,
        importId,
        meta.fileName,
        refs
      );

      if (inserted) newRows++;
      else updatedRows++;
    }

    /**
     * Technique.
     */
    for (const r of v.tech) {
      const inserted = await upsertTech(
        r,
        importId,
        meta.fileName,
        refs
      );

      if (inserted) newRows++;
      else updatedRows++;
    }

    /**
     * Recouvrement.
     */
    for (const r of v.rec) {
      const inserted = await upsertRec(
        r,
        importId,
        meta.fileName,
        refs
      );

      if (inserted) newRows++;
      else updatedRows++;
    }

    /**
     * Anomalies.
     */
    for (const a of v.anomalies) {
      const { error } = await supabaseAdmin
        .from('data_quality_issues')
        .insert({
          import_id: importId,
          severity: a.severity,
          category: a.sheet,
          message: a.message,
          sheet_name: a.sheet,
          issue_type: a.issueType,
          excel_row: a.excelRow || null,
          source_value: a.sourceValue ?? null,
          field: a.field ?? null,
        });

      if (error) throw error;
    }

    /**
     * Information spécifique aux données 2025.
     */
    if (
      meta.sourceYear === 2025 &&
      v.periods.length
    ) {
      const { error } = await supabaseAdmin
        .from('data_quality_issues')
        .insert({
          import_id: importId,
          severity: 'info',
          category: 'BD_FAC',
          message:
            `Le fichier ${yearOf(v.periods[0])} contient des périodes partielles ; ` +
            `les totaux annuels peuvent être comparés à périmètre homogène.`,
          sheet_name: 'BD_FAC',
          issue_type: 'portion_annee',
        });

      if (error) throw error;
    }

    let status: ImportResult['status'] = 'validated';

    const criticals = v.anomalies.filter(
      (a) => a.severity === 'critical'
    ).length;

    if (criticals > 0) {
      status = 'failed';
    } else if (v.anomalies.length > 0) {
      status = 'partial';
    }

    /**
     * Mise à jour de l'historique.
     */
    const { error: updateError } = await supabaseAdmin
      .from('data_imports')
      .update({
        status,
        rows_new: newRows,
        rows_updated: updatedRows,
      })
      .eq('id', importId);

    if (updateError) throw updateError;

    return {
      importId,
      file_name: meta.fileName,
      newRows,
      updatedRows,
      totalRows: newRows + updatedRows,
      anomaliesCount: v.anomalies.length,
      status,
    };
  } catch (error) {
    /**
     * Si l'import a déjà été créé, on conserve sa trace
     * et on le marque failed.
     */
    if (importId !== null) {
      try {
        await supabaseAdmin
          .from('data_imports')
          .update({
            status: 'failed',
            rows_new: newRows,
            rows_updated: updatedRows,
            error_message:
              error instanceof Error
                ? error.message
                : 'Erreur pendant l’import.',
          })
          .eq('id', importId);
      } catch {
        // Ne masque pas l'erreur originale.
      }
    }

    throw error;
  }
}

/**
 * Annule un import.
 *
 * Supprime les lignes qui portent cet import_id,
 * supprime les anomalies associées puis marque
 * l'import comme rolled_back.
 */
export async function rollbackImport(
  importId: number
): Promise<{ deletedRows: number }> {
  let deletedRows = 0;

  const tables = [
    'facturation_monthly',
    'technique_monthly',
    'recouvrement_monthly',
  ] as const;

  try {
    for (const table of tables) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('import_id', importId)
        .select('id');

      if (error) throw error;

      deletedRows += data?.length ?? 0;
    }

    const { error: issuesError } = await supabaseAdmin
      .from('data_quality_issues')
      .delete()
      .eq('import_id', importId);

    if (issuesError) throw issuesError;

    const { error: updateError } = await supabaseAdmin
      .from('data_imports')
      .update({
        status: 'rolled_back',
        file_hash: null,
        error_message: 'Annulé par l’administrateur',
      })
      .eq('id', importId);

    if (updateError) throw updateError;

    return { deletedRows };
  } catch (error) {
    throw error;
  }
}

/**
 * Recherche un import à partir de son hash.
 */
export async function findImportByHash(
  hash: string
): Promise<{
  id: number;
  file_name: string;
  imported_at: string;
  status: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('data_imports')
    .select(
      'id, file_name, imported_at, status'
    )
    .eq('file_hash', hash)
    .neq('status', 'rolled_back')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  return {
    id: Number(data.id),
    file_name: data.file_name,
    imported_at: data.imported_at,
    status: data.status,
  };
}

/**
 * Vérifie quelles périodes existent déjà
 * dans facturation_monthly.
 */
export async function periodsExist(
  periods: string[]
): Promise<{ existing: string[] }> {
  if (!periods.length) {
    return { existing: [] };
  }

  const { data, error } = await supabaseAdmin
    .from('facturation_monthly')
    .select('period_month')
    .in('period_month', periods);

  if (error) throw error;

  const existing = Array.from(
    new Set(
      (data ?? []).map((row) =>
        String(row.period_month).slice(0, 7)
      )
    )
  ).slice(0, 12);

  return { existing };
}
