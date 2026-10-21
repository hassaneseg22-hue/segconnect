import { NextResponse } from 'next/server';
import {
  requireAuth,
  requirePermission,
  authErrorResponse,
} from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);

    if (error) {
      throw error;
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();

    await requirePermission(user, 'approvisionnement.view');

    const url = new URL(request.url);
    const currentYear = new Date().getFullYear();

    const year = Number(url.searchParams.get('year') || currentYear);
    const monthParam = url.searchParams.get('month');
    const center = (url.searchParams.get('center') || '').trim();
    const rowTypeParam = url.searchParams.get('rowType') || 'ALL';

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, error: 'Année invalide.' },
        { status: 400 }
      );
    }

    let month: number | null = null;

    if (monthParam && monthParam !== 'all') {
      month = Number(monthParam);

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { ok: false, error: 'Mois invalide.' },
          { status: 400 }
        );
      }
    }

    const allowedRowTypes = ['ALL', 'CENTER', 'AGGREGATE'];

    if (!allowedRowTypes.includes(rowTypeParam)) {
      return NextResponse.json(
        { ok: false, error: 'Type de données invalide.' },
        { status: 400 }
      );
    }

    // 1. Approvisionnements mensuels.
    const supplies = await fetchAllRows<{
      id: number;
      exercise: number;
      month: number;
      center_name: string | null;
      product_name: string | null;
      row_type: string;
      quantity: number | string | null;
    }>((from, to) => {
      let query = supabaseAdmin
        .from('seg_technique_supply_monthly')
        .select(
          'id,exercise,month,center_name,product_name,row_type,quantity'
        )
        .eq('exercise', year)
        .order('month', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      if (month !== null) {
        query = query.eq('month', month);
      }

      if (center) {
        query = query.eq('center_name', center);
      }

      if (rowTypeParam !== 'ALL') {
        query = query.eq('row_type', rowTypeParam);
      }

      return query;
    });

    // 2. Demandes historiques.
    const requests = await fetchAllRows<{
      id: number;
      period_start: string;
      period_end: string | null;
      center_no: number | null;
      center_name: string | null;
      row_type: string | null;
      gasoil_requested_l: number | string | null;
      hth_kg: number | string | null;
      sulfate_kg: number | string | null;
      carbonate_kg: number | string | null;
      lime_kg: number | string | null;
      tank_capacity_l: number | string | null;
      tank_capacity_note: string | null;
      observations: string | null;
    }>((from, to) => {
      let query = supabaseAdmin
        .from('seg_technique_supply_requests')
        .select(
          'id,period_start,period_end,center_no,center_name,row_type,gasoil_requested_l,hth_kg,sulfate_kg,carbonate_kg,lime_kg,tank_capacity_l,tank_capacity_note,observations'
        )
        .gte('period_start', `${year}-01-01`)
        .lt('period_start', `${year + 1}-01-01`)
        .order('period_start', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      if (month !== null) {
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const next = new Date(Date.UTC(year, month, 1));
        const end = `${next.getUTCFullYear()}-${String(
          next.getUTCMonth() + 1
        ).padStart(2, '0')}-01`;

        query = query.gte('period_start', start).lt('period_start', end);
      }

      if (center) {
        query = query.eq('center_name', center);
      }

      return query;
    });

    // 3. Liste des centres disponibles dans les deux sources.
    const centerNames = new Set<string>();

    for (const row of supplies) {
      const name = row.center_name?.trim();

      if (name) {
        centerNames.add(name);
      }
    }

    for (const row of requests) {
      const name = row.center_name?.trim();

      if (name) {
        centerNames.add(name);
      }
    }

    const centers = Array.from(centerNames).sort((a, b) =>
      a.localeCompare(b, 'fr')
    );

    return NextResponse.json(
      {
        ok: true,
        filters: {
          year,
          month,
          center: center || null,
          rowType: rowTypeParam,
        },
        data: {
          supplies,
          requests,
          centers,
        },
        counts: {
          supplies: supplies.length,
          requests: requests.length,
          centers: centers.length,
        },
        meta: {
          centerAndAggregateSeparated: true,
          note: 'Les demandes et les approvisionnements sont des données distinctes.',
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    const response = authErrorResponse(error);

    if (response.status !== 500) {
      return response;
    }

    console.error(
      '[api/kpi/approvisionnement]',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'Impossible de charger les données d’approvisionnement.',
      },
      { status: 500 }
    );
  }
}
