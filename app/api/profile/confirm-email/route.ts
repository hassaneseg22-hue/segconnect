import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;

  try {
    user = await requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() || null;

  const userAgent = req.headers.get('user-agent');

  try {
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(user.id);

    if (authError || !authUser.user) {
      return NextResponse.json(
        { ok: false, error: 'AUTH_USER_NOT_FOUND' },
        { status: 404 }
      );
    }

    const confirmedEmail = String(
      authUser.user.email ?? ''
    ).trim().toLowerCase();

    if (!confirmedEmail) {
      return NextResponse.json(
        { ok: false, error: 'EMAIL_MISSING' },
        { status: 422 }
      );
    }

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('email, pending_email')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return NextResponse.json(
        { ok: false, error: 'PROFILE_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (
      profile.pending_email &&
      confirmedEmail !==
        String(profile.pending_email).trim().toLowerCase()
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'EMAIL_NOT_CONFIRMED',
          message:
            "L'adresse email n'a pas encore été confirmée par Supabase.",
        },
        { status: 400 }
      );
    }

    const { error: updateError } =
      await supabaseAdmin
        .from('profiles')
        .update({
          email: confirmedEmail,
          pending_email: null,
          updated_at: new Date().toISOString(),
          profile_updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

    if (updateError) throw updateError;

    await createAuditLog({
      userId: user.id,
      action: 'EMAIL_CHANGED',
      targetType: 'USER',
      targetId: user.id,
      description: "Changement d'adresse email confirmé",
      metadata: {
        new_email: confirmedEmail,
      },
      ip,
      userAgent,
      result: 'SUCCESS',
    });

    return NextResponse.json({
      ok: true,
      data: {
        email: confirmedEmail,
      },
    });
  } catch (error) {
    console.error('[confirm-email] Erreur:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
