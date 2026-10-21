import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------
// GET /api/import/[id]
//
// Retourne le détail d'un import ainsi que ses anomalies.
//
// MySQL → Supabase
// ---------------------------------------------------------------------

type ImportRow = {
  id: number;
  file_name: string | null;
  file_hash: string | null;
  file_size: number | null;
  source_year: number | null;
  period_start: string | null;
  period_end: string | null;
  import_type: string | null;
  imported_at: string | null;
  status: string | null;
  rows_count: number | null;
  rows_new: number | null;
  rows_updated: number | null;
  anomalies_count: number | null;
  user_name: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

type QualityIssueRow = {
  id: number;
  severity: string | null;
  category: string | null;
  message: string | null;
  sheet_name: string | null;
  issue_type: string | null;
  excel_row: number | null;
  source_value: string | null;
  field: string | null;
  resolved: boolean | null;
  created_at: string | null;
};

// ---------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;

    const importId = Number(id);

    if (!Number.isFinite(importId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Identifiant d'import invalide.",
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------
    // Import depuis Supabase
    // -----------------------------------------------------------------

    const {
      data,
      error: importError,
    } = await supabaseAdmin
      .from('data_imports')
      .select(
        [
          'id',
          'file_name',
          'file_hash',
          'file_size',
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
      .eq('id', importId)
      .maybeSingle();

    if (importError) {
      console.error(
        '[API /api/import/[id]] Supabase import error:',
        importError
      );

      return NextResponse.json(
        {
          ok: false,
          error: importError.message,
        },
        { status: 503 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Import introuvable.',
        },
        { status: 404 }
      );
    }

    // -----------------------------------------------------------------
    // Typage explicite de la ligne retournée
    // -----------------------------------------------------------------

    const importRow = data as unknown as ImportRow;

    // -----------------------------------------------------------------
    // Anomalies associées à l'import
    // -----------------------------------------------------------------

    const {
      data: issueData,
      error: issuesError,
    } = await supabaseAdmin
      .from('data_quality_issues')
      .select(
        [
          'id',
          'severity',
          'category',
          'message',
          'sheet_name',
          'issue_type',
          'excel_row',
          'source_value',
          'field',
          'resolved',
          'created_at',
        ].join(', ')
      )
      .eq('import_id', importId)
      .order('id', {
        ascending: true,
      });

    if (issuesError) {
      console.error(
        '[API /api/import/[id]] Supabase issues error:',
        issuesError
      );

      return NextResponse.json(
        {
          ok: false,
          error: issuesError.message,
        },
        { status: 503 }
      );
    }

    const issues =
      (issueData ?? []) as unknown as QualityIssueRow[];

    // -----------------------------------------------------------------
    // Ordre des niveaux de gravité
    //
    // Équivalent MySQL :
    // FIELD(severity,'critical','warning','info')
    // -----------------------------------------------------------------

    const severityOrder: Record<string, number> = {
      critical: 1,
      warning: 2,
      info: 3,
    };

    const sortedIssues = [...issues].sort(
      (a, b) => {
        const severityA =
          severityOrder[a.severity ?? ''] ?? 99;

        const severityB =
          severityOrder[b.severity ?? ''] ?? 99;

        if (severityA !== severityB) {
          return severityA - severityB;
        }

        return Number(a.id) - Number(b.id);
      }
    );

    // -----------------------------------------------------------------
    // Réponse API
    // -----------------------------------------------------------------

    return NextResponse.json({
      ok: true,

      data: {
        id: Number(importRow.id),

        fileName:
          importRow.file_name,

        fileHash:
          importRow.file_hash,

        fileSize:
          importRow.file_size,

        sourceYear:
          importRow.source_year,

        periodStart:
          importRow.period_start,

        periodEnd:
          importRow.period_end,

        importType:
          importRow.import_type,

        importedAt:
          importRow.imported_at,

        status:
          importRow.status,

        rowsCount:
          importRow.rows_count,

        rowsNew:
          importRow.rows_new,

        rowsUpdated:
          importRow.rows_updated,

        anomaliesCount:
          importRow.anomalies_count,

        userName:
          importRow.user_name,

        errorMessage:
          importRow.error_message,

        metadata:
          importRow.metadata,

        anomalies:
          sortedIssues.map(
            (q) => ({
              id: Number(q.id),

              severity:
                q.severity,

              category:
                q.category,

              message:
                q.message,

              sheet:
                q.sheet_name,

              issueType:
                q.issue_type,

              excelRow:
                q.excel_row,

              sourceValue:
                q.source_value,

              field:
                q.field,

              resolved:
                !!q.resolved,

              createdAt:
                q.created_at,
            })
          ),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erreur Supabase';

    console.error(
      '[API /api/import/[id]] Erreur:',
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
