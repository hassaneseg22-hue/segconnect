import { NextResponse, type NextRequest } from 'next/server';
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
    /**
     * Cette route est conservée uniquement pour
     * compatibilité avec d'anciennes versions du frontend.
     *
     * Le nouveau flux Supabase fonctionne ainsi :
     *
     * /forgot-password
     *       ↓
     * Supabase recovery link
     *       ↓
     * /auth/callback
     *       ↓
     * session Supabase
     *       ↓
     * /reset-password
     *       ↓
     * supabase.auth.updateUser()
     *
     * Le token recovery ne doit jamais être traité
     * ou stocké par notre application.
     */
    const body = await req.json().catch(() => null);

    await createAuditLog({
      userId: null,
      action: 'PASSWORD_RESET_LEGACY_ENDPOINT_USED',
      description:
        'Ancienne route de réinitialisation appelée ; le flux Supabase Auth doit être utilisé.',
      metadata: {
        hasToken: Boolean(body?.token),
      },
      ip,
      userAgent,
      result: 'FAILED',
    });

    return NextResponse.json(
      {
        ok: false,
        error: 'SUPABASE_AUTH_FLOW_REQUIRED',
        message:
          'Veuillez utiliser le lien de récupération envoyé par Supabase.',
      },
      { status: 410 }
    );
  } catch (error) {
    console.error(
      '[reset-password/legacy]',
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
