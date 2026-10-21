import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { rollbackImport } from '@/lib/excel/importer';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------
// POST /api/import/[id]/rollback
//
// Annule un import existant.
//
// MySQL → Supabase
// ---------------------------------------------------------------------

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
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
    // Vérification de l'import dans Supabase
    // -----------------------------------------------------------------

    const {
      data: importRow,
      error: importError,
    } = await supabaseAdmin
      .from('data_imports')
      .select('id, status')
      .eq('id', importId)
      .maybeSingle();

    if (importError) {
      console.error(
        '[API /api/import/[id]/rollback] Supabase error:',
        importError
      );

      throw importError;
    }

    if (!importRow) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Import introuvable.',
        },
        { status: 404 }
      );
    }

    // -----------------------------------------------------------------
    // Déjà annulé
    // -----------------------------------------------------------------

    if (importRow.status === 'rolled_back') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cet import a déjà été annulé.',
        },
        { status: 409 }
      );
    }

    // -----------------------------------------------------------------
    // Rollback via le nouvel importer Supabase
    // -----------------------------------------------------------------

    const { deletedRows } =
      await rollbackImport(importId);

    // -----------------------------------------------------------------
    // Invalidation du cache dashboard
    // -----------------------------------------------------------------

    try {
      revalidatePath('/');
    } catch {
      // no-op
    }

    return NextResponse.json({
      ok: true,
      importId,
      deletedRows,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erreur lors de l'annulation de l'import.";

    console.error(
      '[API /api/import/[id]/rollback] Erreur:',
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
