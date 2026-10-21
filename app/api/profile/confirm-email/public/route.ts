import { NextResponse, type NextRequest } from 'next/server';
import { createAuditLog } from '@/lib/auth/audit';

export async function POST(req: NextRequest) {
  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() || null;

  const userAgent = req.headers.get('user-agent');

  try {
    const body = await req.json().catch(() => null);

    await createAuditLog({
      userId: null,
      action: 'EMAIL_CONFIRMATION_LEGACY_ENDPOINT_USED',
      description:
        "Ancienne route de confirmation email appelée ; la confirmation est maintenant gérée par Supabase Auth.",
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
          "La confirmation de l'adresse email doit être effectuée via le lien envoyé par Supabase.",
      },
      { status: 410 }
    );
  } catch (error) {
    console.error('[confirm-email/public] Erreur:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
