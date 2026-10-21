import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';

import {
  requireAuth,
  authErrorResponse,
} from '@/lib/auth/auth';

import { supabaseAdmin } from '@/lib/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();

    const { id } = await params;
    const documentId = Number(id);

    if (!Number.isInteger(documentId) || documentId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ID_DOCUMENT_INVALIDE',
        },
        { status: 400 }
      );
    }

    const body = await req.json();

    const allowed: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();

      if (!title) {
        return NextResponse.json(
          {
            ok: false,
            error: 'VALIDATION_ERROR',
            message: 'Le titre du document est obligatoire.',
          },
          { status: 422 }
        );
      }

      allowed.title = title;
    }

    if (body.category !== undefined) {
      allowed.category = body.category;
    }

    if (body.status !== undefined) {
      allowed.status = body.status;
    }

    if (body.agency_id !== undefined) {
      allowed.agency_id =
        body.agency_id === null || body.agency_id === ''
          ? null
          : Number(body.agency_id);
    }

    if (body.description !== undefined) {
      allowed.description =
        body.description === null
          ? null
          : String(body.description);
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NO_CHANGES',
          message: 'Aucune modification fournie.',
        },
        { status: 400 }
      );
    }

    allowed.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('documents')
      .update(allowed)
      .eq('id', documentId)
      .select(
        `
        id,
        title,
        description,
        category,
        status,
        agency_id,
        updated_at
        `
      )
      .maybeSingle();

    if (error) {
      console.error(
        '[documents/PATCH] Supabase:',
        error
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'DATABASE_ERROR',
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NOT_FOUND',
          message: 'Document introuvable.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ApiAuthError'
    ) {
      return authErrorResponse(error);
    }

    console.error(
      '[documents/PATCH] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();

    const { id } = await params;
    const documentId = Number(id);

    if (!Number.isInteger(documentId) || documentId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ID_DOCUMENT_INVALIDE',
        },
        { status: 400 }
      );
    }

    /*
     * On récupère d'abord le chemin du fichier.
     * Il sera supprimé après la suppression de
     * l'enregistrement Supabase.
     */
    const { data: document, error: findError } =
      await supabaseAdmin
        .from('documents')
        .select('id, file_path')
        .eq('id', documentId)
        .maybeSingle();

    if (findError) {
      console.error(
        '[documents/DELETE] Recherche Supabase:',
        findError
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'DATABASE_ERROR',
          message: findError.message,
        },
        { status: 500 }
      );
    }

    if (!document) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NOT_FOUND',
          message: 'Document introuvable.',
        },
        { status: 404 }
      );
    }

    const { error: deleteError } =
      await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', documentId);

    if (deleteError) {
      console.error(
        '[documents/DELETE] Suppression Supabase:',
        deleteError
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'DATABASE_ERROR',
          message: deleteError.message,
        },
        { status: 500 }
      );
    }

    /*
     * Suppression du fichier physique local.
     *
     * On ne supprime que les fichiers situés
     * dans /uploads/documents/.
     */
    const filePath = document.file_path;

    if (
      filePath &&
      filePath.startsWith('/uploads/documents/')
    ) {
      try {
        const absolutePath = path.join(
          process.cwd(),
          'public',
          filePath.replace(/^\//, '')
        );

        await unlink(absolutePath);
      } catch {
        /*
         * Le fichier peut déjà avoir été supprimé.
         * La suppression du document reste considérée
         * comme réussie.
         */
      }
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ApiAuthError'
    ) {
      return authErrorResponse(error);
    }

    console.error(
      '[documents/DELETE] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
