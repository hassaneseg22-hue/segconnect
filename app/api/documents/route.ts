import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import {
  requireAuth,
  authErrorResponse,
} from '@/lib/auth/auth';

import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_CATEGORIES = [
  'courriers',
  'rapports',
  'archives',
  'officiels',
];

const CATEGORY_TO_DB: Record<string, string> = {
  courriers: 'COURRIER',
  rapports: 'RAPPORT',
  archives: 'ARCHIVE',
  officiels: 'DOCUMENT_OFFICIEL',
};

const CATEGORY_FROM_DB: Record<string, string> = {
  COURRIER: 'courriers',
  RAPPORT: 'rapports',
  ARCHIVE: 'archives',
  DOCUMENT_OFFICIEL: 'officiels',
};

const STATUS_TO_DB: Record<string, string> = {
  active: 'ACTIVE',
  pending: 'PENDING',
  archived: 'ARCHIVE',
};

const STATUS_FROM_DB: Record<string, string> = {
  ACTIVE: 'active',
  PENDING: 'pending',
  ARCHIVE: 'archived',
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function normalizeCategory(value: string | null) {
  if (!value || value === 'all') return null;

  return CATEGORY_TO_DB[value] ?? null;
}

function normalizeStatus(value: string | null) {
  if (!value || value === 'all') return null;

  return STATUS_TO_DB[value] ?? null;
}

function serializeDocument(row: any) {
  return {
    ...row,

    category:
      CATEGORY_FROM_DB[row.category] ??
      row.category,

    status:
      STATUS_FROM_DB[row.status] ??
      row.status,

    uploader_name:
      row.uploader_name ??
      row.uploaded_by_name ??
      null,

    agency_name:
      row.agency_name ??
      null,

    file_type:
      row.mime_type
        ? String(row.mime_type)
            .split('/')
            .pop()
            ?.toUpperCase() ?? 'PDF'
        : row.file_type ?? 'PDF',
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const sp = req.nextUrl.searchParams;

    const categoryParam = sp.get('category');
    const statusParam = sp.get('status');
    const search = sp.get('search')?.trim() ?? '';

    const limit = Math.min(
      Math.max(Number(sp.get('limit') || 50), 1),
      200
    );

    const offset = Math.max(
      Number(sp.get('offset') || 0),
      0
    );

    const category = normalizeCategory(categoryParam);
    const status = normalizeStatus(statusParam);

    let query = supabaseAdmin
      .from('documents')
      .select(
        `
        *,
        agency:agencies(
          id,
          name
        ),
        uploader:profiles!documents_uploaded_by_fkey(
          id,
          display_name,
          first_name,
          last_name
        )
        `,
        { count: 'exact' }
      )
      .order('created_at', {
        ascending: false,
      })
      .range(
        offset,
        offset + limit - 1
      );

    if (category) {
      query = query.eq(
        'category',
        category
      );
    }

    if (status) {
      query = query.eq(
        'status',
        status
      );
    }

    if (search) {
      /*
       * Recherche principale sur le titre et la description.
       * Les noms d'agence et d'utilisateur sont ajoutés
       * après récupération afin de ne pas dépendre d'une
       * syntaxe PostgREST fragile sur les relations.
       */
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const {
      data: rows,
      error,
      count,
    } = await query;

    if (error) {
      console.error(
        '[documents/GET] Supabase:',
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

    const documents = (rows ?? []).map(
  (row: any) =>
    serializeDocument({
      ...row,

      agency_name:
        row.agency?.name ?? null,

      uploader_name:
        row.uploader?.display_name ??
        (
          (
            `${row.uploader?.first_name ?? ''} ${
              row.uploader?.last_name ?? ''
            }`
          ).trim() || null
        ),
    })
);

    /*
     * Les statistiques sont indépendantes des filtres.
     * Elles correspondent donc aux compteurs affichés
     * en haut de la page.
     */
    const { data: allDocuments, error: statsError } =
      await supabaseAdmin
        .from('documents')
        .select('status');

    if (statsError) {
      console.error(
        '[documents/GET] Statistiques:',
        statsError
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'DATABASE_ERROR',
          message: statsError.message,
        },
        { status: 500 }
      );
    }

    const statsRows = allDocuments ?? [];

    const stats = {
      total: statsRows.length,

      active: statsRows.filter(
        (row) =>
          row.status === 'ACTIVE'
      ).length,

      pending: statsRows.filter(
        (row) =>
          row.status === 'PENDING'
      ).length,

      archived: statsRows.filter(
        (row) =>
          row.status === 'ARCHIVE'
      ).length,
    };

    return NextResponse.json({
      ok: true,
      data: documents,
      total: count ?? 0,
      stats,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ApiAuthError'
    ) {
      return authErrorResponse(error);
    }

    console.error(
      '[documents/GET] Erreur:',
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

export async function POST(
  req: NextRequest
) {
  let uploadedFilePath: string | null = null;

  try {
    const user = await requireAuth();

    const contentType =
      req.headers.get('content-type') || '';

    let title = '';
    let category = 'rapports';
    let fileType = 'PDF';
    let filePath = '';
    let fileSize = 0;
    let agencyId: number | null = null;
    let description: string | null = null;
    let mimeType: string | null = null;

    if (
      contentType.includes(
        'multipart/form-data'
      )
    ) {
      const form =
        await req.formData();

      const file =
        form.get('file') as File | null;

      if (
        !file ||
        file.size === 0
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'FILE_REQUIRED',
            message:
              'Fichier requis.',
          },
          { status: 400 }
        );
      }

      if (
        file.size >
        MAX_FILE_SIZE
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'FILE_TOO_LARGE',
            message:
              'Fichier trop volumineux (max 25 Mo).',
          },
          { status: 400 }
        );
      }

      const rawTitle =
        String(
          form.get('title') || ''
        ).trim();

      title =
        rawTitle ||
        file.name
          .replace(
            /\.[^.]+$/,
            ''
          )
          .replace(
            /_/g,
            ' '
          );

      const requestedCategory =
        String(
          form.get('category') || ''
        ).trim();

      if (
        VALID_CATEGORIES.includes(
          requestedCategory
        )
      ) {
        category =
          requestedCategory;
      }

      const desc =
        form.get(
          'description'
        );

      description =
        desc
          ? String(desc)
          : null;

      const agency =
        form.get(
          'agency_id'
        );

      agencyId =
        agency !== null &&
        String(agency).trim() !== ''
          ? Number(agency) || null
          : null;

      const ext =
        (
          file.name
            .split('.')
            .pop() || ''
        ).toLowerCase();

      fileType =
        ext
          ? ext.toUpperCase()
          : 'PDF';

      mimeType =
        file.type || null;

      fileSize =
        file.size;

      const safeName =
        `${Date.now()}-${file.name.replace(
          /[^a-zA-Z0-9._-]/g,
          '_'
        )}`;

      const directory =
        path.join(
          process.cwd(),
          'public',
          'uploads',
          'documents'
        );

      await mkdir(
        directory,
        {
          recursive: true,
        }
      );

      const absoluteFilePath =
        path.join(
          directory,
          safeName
        );

      await writeFile(
        absoluteFilePath,
        Buffer.from(
          await file.arrayBuffer()
        )
      );

      filePath =
        `/uploads/documents/${safeName}`;

      uploadedFilePath =
        filePath;
    } else {
      const body =
        await req.json();

      title =
        String(
          body.title || ''
        );

      category =
        String(
          body.category ||
            'rapports'
        );

      fileType =
        String(
          body.file_type ||
            'PDF'
        );

      filePath =
        String(
          body.file_path ||
            ''
        );

      fileSize =
        Number(
          body.file_size ||
            0
        );

      agencyId =
        body.agency_id ===
          null ||
        body.agency_id ===
          undefined ||
        body.agency_id === ''
          ? null
          : Number(
              body.agency_id
            ) || null;

      description =
        body.description ===
          null ||
        body.description ===
          undefined
          ? null
          : String(
              body.description
            );

      mimeType =
        body.mime_type
          ? String(
              body.mime_type
            )
          : null;
    }

    title =
      title
        .trim()
        .slice(
          0,
          255
        );

    if (
      !title ||
      !filePath
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'TITLE_AND_FILE_REQUIRED',
          message:
            'Titre et fichier requis.',
        },
        { status: 400 }
      );
    }

    if (
      !VALID_CATEGORIES.includes(
        category
      )
    ) {
      category =
        'rapports';
    }

    const dbCategory =
      CATEGORY_TO_DB[
        category
      ];

    const { data, error } =
      await supabaseAdmin
        .from('documents')
        .insert({
          title,
          description,
          category:
            dbCategory,
          status:
            'ACTIVE',
          file_name:
            uploadedFilePath
              ? path.basename(
                  uploadedFilePath
                )
              : path.basename(
                  filePath
                ),
          file_path:
            filePath,
          file_url:
            filePath,
          mime_type:
            mimeType,
          file_size:
            fileSize,
          agency_id:
            agencyId,
          uploaded_by:
            user.id,
          document_date:
            new Date()
              .toISOString()
              .slice(
                0,
                10
              ),
          is_archived:
            false,
          metadata: {
            file_type:
              fileType,
          },
        })
        .select(
          `
          id,
          title,
          category,
          status,
          file_name,
          file_path,
          file_size,
          agency_id,
          uploaded_by,
          created_at
          `
        )
        .single();

    if (error) {
      console.error(
        '[documents/POST] Supabase:',
        error
      );

      /*
       * Si l'insertion échoue après avoir écrit
       * le fichier localement, on nettoie le fichier
       * pour éviter un fichier orphelin.
       */
      if (
        uploadedFilePath &&
        uploadedFilePath.startsWith(
          '/uploads/documents/'
        )
      ) {
        try {
          await import(
            'fs/promises'
          ).then(
            ({ unlink }) =>
              unlink(
                path.join(
                  process.cwd(),
                  'public',
                  uploadedFilePath!.replace(
                    /^\//,
                    ''
                  )
                )
              )
          );
        } catch {
          // Nettoyage non bloquant.
        }
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            'DATABASE_ERROR',
          message:
            error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: data.id,
        data,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ApiAuthError'
    ) {
      return authErrorResponse(error);
    }

    console.error(
      '[documents/POST] Erreur:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'INTERNAL_SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Erreur création document',
      },
      { status: 500 }
    );
  }
}
