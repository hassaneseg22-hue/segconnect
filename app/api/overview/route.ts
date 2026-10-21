import { NextResponse } from 'next/server';

import {
  requireAuth,
  authErrorResponse,
} from '@/lib/auth/auth';

import { getOverview } from '@/lib/overview-db';

export async function GET(req: Request) {
  try {
    // Vérifier que l'utilisateur est connecté
    await requireAuth();

    const url = new URL(req.url);

    // Année
    const yearParam = url.searchParams.get('year');

    const year =
      yearParam &&
      Number.isFinite(Number(yearParam))
        ? Number(yearParam)
        : new Date().getFullYear();

    // Filtres
    const from =
      url.searchParams.get('from') || undefined;

    const to =
      url.searchParams.get('to') || undefined;

    const agency =
      url.searchParams.get('agency') || undefined;

    const clientType =
      url.searchParams.get('clientType') || undefined;

    // Récupération des données depuis Supabase
    const data = await getOverview({
      year,
      from,
      to,
      agency,
      clientType,
    });

    return NextResponse.json({
      ok: true,
      data,
    });

  } catch (error) {

    // Erreur d'authentification / permission
    const authResponse = authErrorResponse(error);

    if (authResponse.status !== 500) {
      return authResponse;
    }

    // Autre erreur
    console.error(
      '[api/overview] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de charger le tableau de bord.',
      },
      {
        status: 503,
      }
    );
  }
}
