import { NextResponse } from 'next/server';

import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    await requireAuth();

    const [
      { data: agencies, error: agenciesError },
      { data: clientTypes, error: clientTypesError },
    ] = await Promise.all([
      supabaseAdmin
        .from('agencies')
        .select('id, name')
        .order('name', { ascending: true }),

      supabaseAdmin
        .from('client_types')
        .select('id, name')
        .order('id', { ascending: true }),
    ]);

    if (agenciesError) {
      throw agenciesError;
    }

    if (clientTypesError) {
      throw clientTypesError;
    }

    return NextResponse.json({
      ok: true,
      data: {
        agencies: (agencies ?? [])
          .map((row) => String(row.name ?? '').trim())
          .filter(Boolean),

        clientTypes: (clientTypes ?? [])
          .map((row) => String(row.name ?? '').trim())
          .filter(Boolean),
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);

    if (authResponse.status !== 500) {
      return authResponse;
    }

    console.error('[api/filters] Erreur:', error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de charger les filtres.',
      },
      { status: 503 }
    );
  }
}
