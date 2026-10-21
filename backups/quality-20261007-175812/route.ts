import { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/quality
// État général de la qualité des données + liste des anomalies

export async function GET(req: Request) {
  try {
    const currentUser = await requireAuth();

    const url = new URL(req.url);

    const page = Math.max(
      1,
      Number(url.searchParams.get('page') || '1')
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number(url.searchParams.get('limit') || '25')
      )
    );

    const severity = url.searchParams.get('severity');
    const category = url.searchParams.get('category');
    const resolvedParam = url.searchParams.get('resolved');
    const search = url.searchParams.get('search')?.trim() || '';

    const offset = (page - 1) * limit;

    /*
     * Construction de la requête principale.
     *
     * Table Supabase :
     * data_quality_issues
     *
     * Colonnes disponibles :
     * id
     * import_id
     * severity
     * category
     * message
     * sheet_name
     * issue_type
     * excel_row
     * source_value
     * field
     * resolved
     * created_at
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
          created_at
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (resolvedParam === '1') {
      query = query.eq('resolved', true);
    } else if (resolvedParam === '0') {
      query = query.eq('resolved', false);
    }

    if (search) {
      query = query.or(
        [
          `message.ilike.%${search}%`,
          `category.ilike.%${search}%`,
          `issue_type.ilike.%${search}%`,
          `field.ilike.%${search}%`,
          `source_value.ilike.%${search}%`,
          `sheet_name.ilike.%${search}%`,
        ].join(',')
      );
    }

    const {
      data: rows,
      error,
      count,
    } = await query;

    if (error) {
      console.error('[api/quality] Supabase:', error);

      return NextResponse.json(
        {
          ok: false,
          error: 'Impossible de récupérer les anomalies de qualité.',
          details: error.message,
        },
        { status: 500 }
      );
    }

    /*
     * Statistiques globales
     */

    const { data: allIssues, error: statsError } =
      await supabaseAdmin
        .from('data_quality_issues')
        .select('severity, resolved');

    if (statsError) {
      console.error(
        '[api/quality] Statistiques Supabase:',
        statsError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            'Impossible de récupérer les statistiques de qualité.',
          details: statsError.message,
        },
        { status: 500 }
      );
    }

    const issues = allIssues ?? [];

    const total = issues.length;

    const unresolved = issues.filter(
      (issue) => issue.resolved === false
    ).length;

    const resolved = issues.filter(
      (issue) => issue.resolved === true
    ).length;

    const critical = issues.filter(
      (issue) =>
        issue.resolved === false &&
        String(issue.severity).toLowerCase() === 'critical'
    ).length;

    const high = issues.filter(
      (issue) =>
        issue.resolved === false &&
        String(issue.severity).toLowerCase() === 'high'
    ).length;

    const medium = issues.filter(
      (issue) =>
        issue.resolved === false &&
        String(issue.severity).toLowerCase() === 'medium'
    ).length;

    const low = issues.filter(
      (issue) =>
        issue.resolved === false &&
        String(issue.severity).toLowerCase() === 'low'
    ).length;

    /*
     * Score de qualité.
     *
     * Aucun problème = 100%.
     */

    const score =
      total === 0
        ? 100
        : Math.round((resolved / total) * 100);

    /*
     * Transformation pour conserver une structure proche
     * de l'ancienne API.
     */

    const list = (rows ?? []).map((row) => ({
      id: Number(row.id),
      severity: row.severity,
      category: row.category,
      message: row.message,
      sheet: row.sheet_name,
      issueType: row.issue_type,
      excelRow: row.excel_row,
      sourceValue: row.source_value,
      field: row.field,
      resolved: Boolean(row.resolved),
      createdAt: row.created_at,
      importId:
        row.import_id !== null
          ? Number(row.import_id)
          : null,
    }));

    return NextResponse.json({
      ok: true,

      data: {
        counts: {
          critical,
          high,
          medium,
          low,
          unresolved,
          resolved,
          total,
        },

        statistics: {
          total,
          unresolved,
          resolved,
          score,
          bySeverity: {
            critical,
            high,
            medium,
            low,
          },
        },

        list,

        items: list,

        pagination: {
          page,
          limit,
          total: count ?? 0,
          totalPages:
            count && count > 0
              ? Math.ceil(count / limit)
              : 0,
        },

        currentUser: {
          id: currentUser.id,
          displayName: currentUser.display_name,
          role: currentUser.role_code,
        },
      },
    });
  } catch (error) {
    console.error('[api/quality] Erreur:', error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur interne.',
      },
      { status: 500 }
    );
  }
}
