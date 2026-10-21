import { NextResponse, type NextRequest } from 'next/server';
import { createPasswordReset } from '@/lib/users/invitations';
import { recordLoginAttempt } from '@/lib/security/rate-limit';
import { createAuditLog } from '@/lib/auth/audit';

export async function POST(req: NextRequest) {
  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() || null;

  const userAgent =
    req.headers.get('user-agent');

  try {
    const body = await req.json();

    const email = String(
      body.email || ''
    )
      .trim()
      .toLowerCase();

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: 'VALIDATION_ERROR',
        },
        { status: 422 }
      );
    }

    const actionLink =
      await createPasswordReset(email);

    await createAuditLog({
      userId: null,
      action: 'PASSWORD_RESET_REQUESTED',
      description:
        'Demande de réinitialisation de mot de passe',
      metadata: {
        email,
        linkGenerated: Boolean(actionLink),
      },
      ip,
      userAgent,
      result: 'SUCCESS',
    });

    if (!actionLink) {
      await recordLoginAttempt({
        email,
        userId: null,
        ip,
        success: false,
        reason:
          'PASSWORD_RESET_UNKNOWN_EMAIL',
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        'Si un compte correspond à cette adresse, un lien de récupération a été envoyé.',
    });
  } catch (error) {
    console.error(
      '[forgot-password]',
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
