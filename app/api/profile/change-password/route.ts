import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let body: {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_ERROR' },
      { status: 422 }
    );
  }

  let user: Awaited<ReturnType<typeof requireAuth>>;

  try {
    user = await requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');

  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() || null;

  const userAgent = req.headers.get('user-agent');

  try {
    if (newPassword.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          error: 'WEAK_PASSWORD',
          message: 'Le mot de passe doit contenir au moins 8 caractères.',
        },
        { status: 422 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        {
          ok: false,
          error: 'SAME_PASSWORD',
          message: 'Le nouveau mot de passe doit être différent.',
        },
        { status: 422 }
      );
    }

    const email = String(user.email ?? '').trim();

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: 'AUTH_EMAIL_MISSING',
          message: 'Adresse email du compte introuvable.',
        },
        { status: 422 }
      );
    }

    /*
     * Vérification du mot de passe actuel
     * via Supabase Auth.
     */
    const {
      data: authData,
      error: verifyError,
    } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (
      verifyError ||
      !authData.user ||
      authData.user.id !== user.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'BAD_CURRENT',
          message: 'Le mot de passe actuel est incorrect.',
        },
        { status: 401 }
      );
    }

    /*
     * Modification du mot de passe
     * directement dans Supabase Auth.
     */
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          password: newPassword,
        }
      );

    if (updateError) {
      console.error(
        '[change-password] Supabase:',
        updateError
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'PASSWORD_UPDATE_FAILED',
          message: 'Impossible de modifier le mot de passe.',
        },
        { status: 500 }
      );
    }

    /*
     * Journalisation.
     * L'audit ne doit jamais bloquer
     * la modification du mot de passe.
     */
    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      targetType: 'USER',
      targetId: user.id,
      description: 'Changement du mot de passe',
      ip,
      userAgent,
      result: 'SUCCESS',
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      '[change-password] Erreur:',
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
