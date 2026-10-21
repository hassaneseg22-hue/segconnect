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
    const body = await req.json().catch(() => null);

    await createAuditLog({
      userId: null,
      action: 'ACCOUNT_ACTIVATION_LEGACY_ENDPOINT_USED',
      description:
        "Ancienne route d'activation appelée ; l'activation doit passer par Supabase Auth.",
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
          "Veuillez utiliser le lien d'invitation reçu pour activer votre compte.",
      },
      { status: 410 }
    );
  } catch (error) {
    console.error(
      '[activate/legacy]',
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
