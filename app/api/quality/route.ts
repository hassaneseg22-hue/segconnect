import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    /*
     * Sécurité :
     * l'API n'est pas publique.
     */
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Non authentifié.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const resolvedParam = searchParams.get('resolved');

    /*
     * Par défaut :
     * afficher les anomalies non résolues.
     */
    const resolved =
      resolvedParam === '1' || resolvedParam === 'true';

    /*
     * Récupération des anomalies depuis Supabase.
     */
    let query = supabaseAdmin
      .from('data_quality_issues')
      .select(
        `
        id,
        import_id,
        severity,
        category,
        message,
        sheet_name,
        issue_type,
        excel_row,
        source_value,
        field,
        resolved,
        created_at,
        data_imports (
          file_name
        )
        `
      )
      .eq('resolved', resolved)
      .order('created_at', {
        ascending: false,
      });

    const { data, error } = await query;

    if (error) {
      console.error(
        '[API /quality] Supabase error:',
        error
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            'Impossible de récupérer les anomalies depuis Supabase.',
        },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : [];

    /*
     * Normalisation des données pour le frontend.
     */
    const list = rows.map((row: any) => ({
      id: Number(row.id),

      severity: String(
        row.severity ?? 'info'
      ),

      category: row.category
        ? String(row.category)
        : null,

      message: String(
        row.message ?? ''
      ),

      sheet: row.sheet_name
        ? String(row.sheet_name)
        : null,

      issueType: row.issue_type
        ? String(row.issue_type)
        : null,

      excelRow:
        row.excel_row === null ||
        row.excel_row === undefined
          ? null
          : Number(row.excel_row),

      sourceValue:
        row.source_value === null ||
        row.source_value === undefined
          ? null
          : String(row.source_value),

      field: row.field
        ? String(row.field)
        : null,

      createdAt: row.created_at
        ? String(row.created_at)
        : null,

      importId:
        row.import_id === null ||
        row.import_id === undefined
          ? null
          : Number(row.import_id),

      fileName:
        row.data_imports?.file_name
          ? String(row.data_imports.file_name)
          : null,
    }));

    /*
     * Calcul des compteurs à partir des données
     * réellement retournées par Supabase.
     */
    const critical = list.filter(
      (x) => x.severity === 'critical'
    ).length;

    const warning = list.filter(
      (x) => x.severity === 'warning'
    ).length;

    const info = list.filter(
      (x) => x.severity === 'info'
    ).length;

    const total = list.length;

    return NextResponse.json(
      {
        ok: true,

        data: {
          counts: {
            critical,
            warning,
            info,
            total,
          },

          list,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error(
      '[API /quality] Unexpected error:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'Erreur interne lors de la récupération de la qualité des données.',
      },
      { status: 500 }
    );
  }
}
