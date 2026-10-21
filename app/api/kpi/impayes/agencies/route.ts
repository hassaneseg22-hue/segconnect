import { NextResponse } from 'next/server';

import {
  requireAuth,
  authErrorResponse,
} from '@/lib/auth/auth';

import { supabaseAdmin } from '@/lib/supabase/admin';

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  try {
    await requireAuth();

    const url = new URL(req.url);

    const yearParam = url.searchParams.get('year');

    const year =
      yearParam && Number.isFinite(Number(yearParam))
        ? Number(yearParam)
        : new Date().getFullYear();

    /*
     * Référentiel officiel des agences.
     * Coyah = 10
     * Dubreka = 11
     *
     * On ne code volontairement aucun ID en dur.
     */

    const {
      data: agencies,
      error: agenciesError,
    } = await supabaseAdmin
      .from('agencies')
      .select('id, code, name, active')
      .eq('active', true)
      .order('name', { ascending: true });

    if (agenciesError) {
      throw agenciesError;
    }

    /*
     * Source officielle des impayés.
     */

    const {
      data: impayesRows,
      error: impayesError,
    } = await supabaseAdmin
      .from('seg_impayes_zone')
      .select(`
        id,
        exercise,
        period_month,
        agency_id,
        agency_name_source,
        agent_zone,
        emissions,
        impayes
      `)
      .eq('exercise', year);

    if (impayesError) {
      throw impayesError;
    }

    /*
     * Initialisation avec TOUTES les agences actives.
     *
     * Cela garantit que Coyah et Dubreka peuvent apparaître
     * même si elles n'existent pas dans les anciennes tables.
     */

    const map = new Map<number, {
      id: number;
      code: string | null;
      name: string;
      emissions: number;
      impayes: number;
      rows: number;
    }>();

    for (const agency of agencies ?? []) {
      map.set(Number(agency.id), {
        id: Number(agency.id),
        code: agency.code ?? null,
        name: agency.name,
        emissions: 0,
        impayes: 0,
        rows: 0,
      });
    }

    /*
     * Agrégation des données SEG.
     */

    for (const row of impayesRows ?? []) {
      const agencyId = Number(row.agency_id);

      const agency = map.get(agencyId);

      if (!agency) {
        continue;
      }

      agency.emissions += num(row.emissions);
      agency.impayes += num(row.impayes);
      agency.rows += 1;
    }

    /*
     * Total national.
     */

    const totalEmissions = Array.from(map.values())
      .reduce(
        (sum, agency) => sum + agency.emissions,
        0
      );

    const totalImpayes = Array.from(map.values())
      .reduce(
        (sum, agency) => sum + agency.impayes,
        0
      );

    /*
     * Résultat final.
     *
     * On garde toutes les agences.
     * Les agences sans donnée d'impayés restent à 0,
     * sans inventer de données.
     */

    const result = Array.from(map.values())
      .map((agency) => ({
        id: agency.id,
        code: agency.code,
        name: agency.name,

        emissions: agency.emissions,
        impayes: agency.impayes,

        impayesRate:
          agency.emissions > 0
            ? agency.impayes / agency.emissions
            : 0,

        nationalShare:
          totalImpayes > 0
            ? agency.impayes / totalImpayes
            : 0,

        rows: agency.rows,
      }))
      .sort((a, b) => b.impayes - a.impayes);

    return NextResponse.json({
      ok: true,
      data: {
        year,
        totals: {
          emissions: totalEmissions,
          impayes: totalImpayes,
          impayesRate:
            totalEmissions > 0
              ? totalImpayes / totalEmissions
              : 0,
          rows: impayesRows?.length ?? 0,
        },
        agencies: result,
      },
    });

  } catch (error) {
    const authResponse = authErrorResponse(error);

    if (authResponse.status !== 500) {
      return authResponse;
    }

    console.error(
      '[api/kpi/impayes/agencies]',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de charger les impayés.',
      },
      {
        status: 503,
      }
    );
  }
}
