import { NextResponse, type NextRequest } from 'next/server';

import {
  requireAuth,
  authErrorResponse,
} from '@/lib/auth/auth';

import { createAuditLog } from '@/lib/auth/audit';

import {
  getUserProfile,
  updateUserProfile,
} from '@/lib/users/userProfile';

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const actor = await requireAuth();

    const { id } = await context.params;
    const targetId = Number(id);

    if (!Number.isInteger(targetId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'INVALID_ID',
        },
        { status: 400 }
      );
    }

    const target = await getUserProfile(String(targetId));

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Règle absolue : personne ne modifie un SUPER_ADMIN
    if (
      target.role_code === 'SUPER_ADMIN' &&
      String(targetId) !== String(actor.id)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'FORBIDDEN',
          message:
            'Impossible de modifier le compte administrateur principal.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: target,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PUT(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const actor = await requireAuth();

    const { id } = await context.params;
    const targetId = Number(id);

    if (!Number.isInteger(targetId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'INVALID_ID',
        },
        { status: 400 }
      );
    }

    const target = await getUserProfile(String(targetId));

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Règle absolue : personne ne modifie un SUPER_ADMIN
    if (
      target.role_code === 'SUPER_ADMIN' &&
      String(targetId) !== String(actor.id)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'FORBIDDEN',
          message:
            'Impossible de modifier le compte administrateur principal.',
        },
        { status: 403 }
      );
    }

    const body = await req.json();

    const result = await updateUserProfile(
      String(targetId),
      {
        first_name:
          body.first_name !== undefined
            ? body.first_name
            : undefined,

        last_name:
          body.last_name !== undefined
            ? body.last_name
            : undefined,

        phone:
          body.phone !== undefined
            ? body.phone
            : undefined,

        job_title:
          body.job_title !== undefined
            ? body.job_title
            : undefined,
      }
    );

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        return NextResponse.json(
          {
            ok: false,
            error: 'NOT_FOUND',
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: result.reason,
        },
        { status: 422 }
      );
    }

    if (!result.data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'UPDATE_FAILED',
        },
        { status: 500 }
      );
    }

    await createAuditLog({
      userId: actor.id,
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: String(targetId),
      description:
        'Mise à jour du profil utilisateur',
      metadata: {
        targetUserId: String(targetId),
      },
      result: 'SUCCESS',
    });

    return NextResponse.json({
      ok: true,
      data: result.data,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
