import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { supabaseAdmin } from '@/lib/supabase/admin';

import { checkFileSecurity, sha256 } from '@/lib/excel/security';
import { parseWorkbook } from '@/lib/excel/parser';
import { validateWorkbook, periodsLabels } from '@/lib/excel/validator';
import {
  importValidated,
  findImportByHash,
  periodsExist,
} from '@/lib/excel/importer';

import { insertNotificationDedup } from '@/lib/notifications-db';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ---------------------------------------------------------------------
// POST /api/import
//
// action=analyze : analyse en mémoire, aucune écriture DB
// action=import  : analyse + import dans Supabase
//
// Body : FormData
// { file, action, confirm?, userName? }
// ---------------------------------------------------------------------

export async function POST(req: Request) {
  let file: File | null = null;
  let action = 'analyze';
  let confirm = 'false';
  let userName: string | undefined;

  try {
    const form = await req.formData();

    action = String(form.get('action') || 'analyze');
    confirm = String(form.get('confirm') || 'false');

    userName = (form.get('userName') as string) || undefined;

    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Requête invalide.',
      },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Aucun fichier reçu.',
      },
      { status: 400 }
    );
  }

  try {
    // -----------------------------------------------------------------
    // Sécurité : extension / MIME / taille
    // -----------------------------------------------------------------

    const sec = checkFileSecurity(
      file.name,
      file.type,
      file.size
    );

    if (!sec.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: sec.error,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = sha256(buffer);

    // -----------------------------------------------------------------
    // Détection d'un même fichier déjà importé
    // -----------------------------------------------------------------

    const existing = await findImportByHash(hash);

    if (existing && action === 'import') {
      return NextResponse.json(
        {
          ok: false,
          code: 'already_imported',
          error: 'Ce fichier a déjà été importé.',
          existing,
        },
        { status: 409 }
      );
    }

    // -----------------------------------------------------------------
    // Analyse du classeur en mémoire
    // -----------------------------------------------------------------

    const wb = parseWorkbook(buffer, file.name);

    wb.fileSize = file.size;
    wb.fileHash = hash;

    const result = validateWorkbook(wb);

    // -----------------------------------------------------------------
    // Détection des feuilles
    // -----------------------------------------------------------------

    const sheetDetected = {
      BD_FAC:
        result.counts.fac > 0 ||
        wb.sheets.some((s) => s.name === 'BD_FAC'),

      BD_TECH:
        result.counts.tech > 0 ||
        wb.sheets.some((s) => s.name === 'BD_TECH'),

      BD_Recouv:
        result.counts.rec > 0 ||
        wb.sheets.some((s) => s.name === 'BD_Recouv'),
    };

    // -----------------------------------------------------------------
    // Détection des doublons dans les données analysées
    // -----------------------------------------------------------------

    const keysSeen = new Set<string>();
    let dup = 0;

    for (const key of [
      ...result.fac,
      ...result.tech,
      ...result.rec,
    ].map((r) => r.key)) {
      if (keysSeen.has(key)) {
        dup++;
      }

      keysSeen.add(key);
    }

    // -----------------------------------------------------------------
    // Périodes déjà présentes dans Supabase
    // -----------------------------------------------------------------

    const { existing: existingPeriods } =
      await periodsExist(result.periods);

    const hasExisting = existingPeriods.length > 0;

    // -----------------------------------------------------------------
    // Import sans aucune donnée exploitable
    // -----------------------------------------------------------------

    if (
      action === 'import' &&
      !result.counts.fac &&
      !result.counts.tech &&
      !result.counts.rec
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Aucune donnée exploitable. Le fichier doit contenir au moins une feuille BD_FAC, BD_TECH ou BD_Recouv avec des lignes lisibles.',

          sheets: Object.keys(sheetDetected).filter(
            (k) =>
              !sheetDetected[
                k as keyof typeof sheetDetected
              ]
          ),
        },
        { status: 422 }
      );
    }

    // -----------------------------------------------------------------
    // Étape ANALYZE
    //
    // Aucune écriture dans Supabase.
    // -----------------------------------------------------------------

    if (action === 'analyze') {
      return NextResponse.json({
        ok: true,
        action: 'analyze',

        analysis: {
          fileName: file.name,
          fileSize: file.size,
          fileHash: hash,

          sourceYear: wb.sourceYear,

          alreadyImported: !!existing,
          existingImportId: existing?.id ?? null,

          uncertainPeriods: false,

          sheetDetected,

          sheetRawCounts: {
            BD_FAC:
              wb.sheets.find(
                (s) => s.name === 'BD_FAC'
              )?.rows.length || 0,

            BD_TECH:
              wb.sheets.find(
                (s) => s.name === 'BD_TECH'
              )?.rows.length || 0,

            BD_Recouv:
              wb.sheets.find(
                (s) => s.name === 'BD_Recouv'
              )?.rows.length || 0,
          },

          counts: result.counts,

          periods: result.periods,

          periodsLabels: periodsLabels(
            result.periods
          ),

          agencies: result.agencies,

          clientTypes: result.clientTypes,

          anomalies: result.anomalies,

          anomaliesCount:
            result.anomalies.length,

          criticalCount:
            result.anomalies.filter(
              (a) => a.severity === 'critical'
            ).length,

          warningCount:
            result.anomalies.filter(
              (a) => a.severity === 'warning'
            ).length,

          infoCount:
            result.anomalies.filter(
              (a) => a.severity === 'info'
            ).length,

          duplicateKeys: dup,

          existingPeriods,
        },
      });
    }

    // -----------------------------------------------------------------
    // Étape IMPORT
    // -----------------------------------------------------------------

    if (action === 'import') {
      // ---------------------------------------------------------------
      // Période déjà présente sans confirmation explicite
      // ---------------------------------------------------------------

      if (
        hasExisting &&
        confirm !== 'true'
      ) {
        return NextResponse.json({
          ok: false,

          code: 'existing_period',

          error:
            'Cette période existe déjà. Confirmez le remplacement pour mettre à jour les données.',

          periods: existingPeriods,

          analysis: {
            periods: result.periods,

            periodsLabels:
              periodsLabels(
                result.periods
              ),

            agencies: result.agencies,

            counts: result.counts,

            anomaliesCount:
              result.anomalies.length,

            duplicateKeys: dup,
          },
        });
      }

      // ---------------------------------------------------------------
      // Import des données validées dans Supabase
      // ---------------------------------------------------------------

      const resultImport =
        await importValidated(
          {
            fac: result.fac,
            tech: result.tech,
            rec: result.rec,
            anomalies: result.anomalies,
            periods: result.periods,
          },
          {
            fileName: file.name,
            fileSize: file.size,
            fileHash: hash,
            sourceYear: wb.sourceYear,
            importType: 'excel_composite',
            userName,
            mode: hasExisting
              ? 'reimport'
              : 'import',
          }
        );

      // ---------------------------------------------------------------
      // Invalidation du cache du dashboard
      // ---------------------------------------------------------------

      try {
        revalidatePath('/');
      } catch {
        // no-op
      }

      // ---------------------------------------------------------------
      // Notification système après import réussi
      // ---------------------------------------------------------------

      try {
        const clean =
          resultImport.anomaliesCount === 0;

        await insertNotificationDedup({
          type: clean
            ? 'success'
            : 'info',

          category: 'Système',

          title: clean
            ? 'Données mises à jour avec succès'
            : `Import terminé avec ${resultImport.anomaliesCount} anomalie(s)`,

          message:
            `Le fichier ${file.name} a été importé.\n` +
            `${resultImport.totalRows} ligne(s) traitées ` +
            `(${resultImport.newRows} nouvelles, ` +
            `${resultImport.updatedRows} mises à jour).\n` +
            `Anomalies : ${resultImport.anomaliesCount}.`,

          source: 'data_imports',

          severity_score: clean
            ? 5
            : 30,

          target_url:
            '/import/history',

          metadata: {
            import_id:
              resultImport.importId,

            status:
              resultImport.status,

            rows_new:
              resultImport.newRows,

            rows_updated:
              resultImport.updatedRows,

            anomalies:
              resultImport.anomaliesCount,
          },

          dedupKey:
            `sys:import:${resultImport.importId}`,
        });
      } catch {
        // La notification ne doit pas bloquer l'import.
      }

      // ---------------------------------------------------------------
      // Réponse finale
      // ---------------------------------------------------------------

      return NextResponse.json({
        ok: true,
        action: 'import',
        result: resultImport,
      });
    }

    // -----------------------------------------------------------------
    // Action inconnue
    // -----------------------------------------------------------------

    return NextResponse.json(
      {
        ok: false,
        error: 'Action inconnue.',
      },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erreur inattendue lors de l'import.";

    console.error(
      '[API /api/import] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------
// GET /api/import
//
// Historique des imports.
//
// Migration MySQL → Supabase
// ---------------------------------------------------------------------

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const requestedLimit = Number(
      url.searchParams.get('limit') || 30
    );

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit)
          ? requestedLimit
          : 30,
        1
      ),
      200
    );

    // -----------------------------------------------------------------
    // Lecture depuis Supabase
    // -----------------------------------------------------------------

    const { data: rows, error } =
      await supabaseAdmin
        .from('data_imports')
        .select(
          [
            'id',
            'file_name',
            'file_hash',
            'source_year',
            'period_start',
            'period_end',
            'import_type',
            'imported_at',
            'status',
            'rows_count',
            'rows_new',
            'rows_updated',
            'anomalies_count',
            'user_name',
            'error_message',
            'metadata',
          ].join(', ')
        )
        .order('id', {
          ascending: false,
        })
        .limit(limit);

    if (error) {
      console.error(
        '[API /api/import GET] Supabase error:',
        error
      );

      throw error;
    }

    // -----------------------------------------------------------------
    // Transformation pour conserver le même format API
    // utilisé par le frontend.
    // -----------------------------------------------------------------

    return NextResponse.json({
      ok: true,

      data: (rows ?? []).map(
        (r: any) => ({
          id: Number(r.id),

          fileName:
            r.file_name,

          fileHash:
            r.file_hash,

          sourceYear:
            r.source_year,

          periodStart:
            r.period_start,

          periodEnd:
            r.period_end,

          importType:
            r.import_type,

          importedAt:
            r.imported_at,

          status:
            r.status,

          rowsCount:
            r.rows_count,

          rowsNew:
            r.rows_new,

          rowsUpdated:
            r.rows_updated,

          anomaliesCount:
            r.anomalies_count,

          userName:
            r.user_name,

          errorMessage:
            r.error_message,

          metadata:
            r.metadata,
        })
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erreur Supabase';

    console.error(
      '[API /api/import GET] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 503 }
    );
  }
}
