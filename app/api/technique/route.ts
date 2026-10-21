import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentification requise.' },
        { status: 401 }
      );
    }

    const params = request.nextUrl.searchParams;
    const year = Number(params.get('year') ?? new Date().getFullYear());
    const monthValue = params.get('month');
    const center = params.get('center');
    const rowType = params.get('rowType');

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, error: 'Année invalide.' },
        { status: 400 }
      );
    }

    let month: number | null = null;

    if (monthValue !== null && monthValue !== '') {
      month = Number(monthValue);

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { ok: false, error: 'Mois invalide.' },
          { status: 400 }
        );
      }
    }

    // Données mensuelles de production et de gasoil.
    let centersQuery = supabaseAdmin
      .from('seg_technique_center_monthly')
      .select(
        'id,period_month,center_no,center_name,raw_water_m3,treated_water_m3,station_yield,gasoil_delivered_l,gasoil_opening_stock_l,gasoil_consumption_l,gasoil_other_l,gasoil_closing_stock_l'
      )
      .gte('period_month', `${year}-01-01`)
      .lt('period_month', `${year + 1}-01-01`)
      .order('period_month', { ascending: true });

    if (month !== null) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const next = new Date(Date.UTC(year, month, 1));
      const end = `${next.getUTCFullYear()}-${String(
        next.getUTCMonth() + 1
      ).padStart(2, '0')}-01`;

      centersQuery = centersQuery.gte('period_month', start).lt('period_month', end);
    }

    if (center) {
      centersQuery = centersQuery.eq('center_name', center);
    }

    const { data: centers, error: centersError } = await centersQuery;

    if (centersError) {
      console.error('[technique/centers]', centersError.message);
      return NextResponse.json(
        { ok: false, error: 'Erreur de lecture des données des centres.' },
        { status: 500 }
      );
    }

    // Approvisionnement mensuel : CENTER et AGGREGATE restent distincts.
    let suppliesQuery = supabaseAdmin
      .from('seg_technique_supply_monthly')
      .select(
        'id,exercise,month,center_name,product_name,row_type,quantity'
      )
      .eq('exercise', year)
      .order('month', { ascending: true });

    if (month !== null) {
      suppliesQuery = suppliesQuery.eq('month', month);
    }

    if (center) {
      suppliesQuery = suppliesQuery.eq('center_name', center);
    }

    if (rowType === 'CENTER' || rowType === 'AGGREGATE') {
      suppliesQuery = suppliesQuery.eq('row_type', rowType);
    }

    const { data: supplies, error: suppliesError } = await suppliesQuery;

    if (suppliesError) {
      console.error('[technique/supplies]', suppliesError.message);
      return NextResponse.json(
        { ok: false, error: 'Erreur de lecture des approvisionnements.' },
        { status: 500 }
      );
    }

    // Demandes historiques de produits et de gasoil.
    let requestsQuery = supabaseAdmin
      .from('seg_technique_supply_requests')
      .select(
        'id,period_start,period_end,center_no,center_name,row_type,gasoil_requested_l,hth_kg,sulfate_kg,carbonate_kg,lime_kg,tank_capacity_l,tank_capacity_note,observations'
      )
      .gte('period_start', `${year}-01-01`)
      .lt('period_start', `${year + 1}-01-01`)
      .order('period_start', { ascending: true });

    if (center) {
      requestsQuery = requestsQuery.eq('center_name', center);
    }

    const { data: requests, error: requestsError } = await requestsQuery;

    if (requestsError) {
      console.error('[technique/requests]', requestsError.message);
      return NextResponse.json(
        { ok: false, error: 'Erreur de lecture des demandes.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        filters: { year, month, center, rowType },
        data: {
          centers: centers ?? [],
          supplies: supplies ?? [],
          requests: requests ?? [],
        },
        counts: {
          centers: centers?.length ?? 0,
          supplies: supplies?.length ?? 0,
          requests: requests?.length ?? 0,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    console.error(
      '[technique]',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );

    return NextResponse.json(
      { ok: false, error: 'Erreur interne lors du chargement des données techniques.' },
      { status: 500 }
    );
  }
}
