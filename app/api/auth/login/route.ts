import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAppUser } from '@/lib/supabase/profile';
import { createAuditLog } from '@/lib/auth/audit';
import {
  isLoginBlocked,
  recordLoginAttempt,
} from '@/lib/security/rate-limit';
import { insertNotification } from '@/lib/notifications-db';

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_ERROR' },
      { status: 422 }
    );
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_ERROR' },
      { status: 422 }
    );
  }

  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const userAgent = req.headers.get('user-agent');

  try {
    if (await isLoginBlocked(email, ip)) {
      await createAuditLog({
        userId: null,
        action: 'LOGIN_FAILED',
        description:
          'Tentative de connexion bloquée (trop d’échecs)',
        metadata: { email },
        ip,
        userAgent,
        result: 'FAILED',
      });

      return NextResponse.json(
        {
          ok: false,
          error: 'RATE_LIMITED',
        },
        { status: 429 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      await recordLoginAttempt({
        email,
        userId: null,
        ip,
        success: false,
        reason: 'BAD_PASSWORD',
      });

      await createAuditLog({
        userId: null,
        action: 'LOGIN_FAILED',
        description: 'Échec de connexion',
        metadata: { email },
        ip,
        userAgent,
        result: 'FAILED',
      });

      return NextResponse.json(
        {
          ok: false,
          error: 'INVALID_CREDENTIALS',
        },
        { status: 401 }
      );
    }

    const authUserId = authData.user.id;

    const user = await getSupabaseAppUser(authUserId);

    if (!user) {
      await supabase.auth.signOut();

      await createAuditLog({
        userId: authUserId,
        action: 'LOGIN_FAILED',
        description: 'Profil applicatif introuvable',
        metadata: { email },
        ip,
        userAgent,
        result: 'FAILED',
      });

      return NextResponse.json(
        {
          ok: false,
          error: 'PROFILE_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    if (user.status !== 'ACTIVE') {
      await supabase.auth.signOut();

      await createAuditLog({
        userId: authUserId,
        action: 'LOGIN_FAILED',
        description:
          `Connexion refusée (compte ${user.status})`,
        metadata: {
          email,
          status: user.status,
        },
        ip,
        userAgent,
        result: 'FAILED',
      });

      return NextResponse.json(
        {
          ok: false,
          error: 'ACCOUNT_INACTIVE',
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    const { error: profileUpdateError } =
      await supabase
        .from('profiles')
        .update({
          last_login_at: now,
          last_login_ip: ip,
          updated_at: now,
        })
        .eq('id', authUserId);

    if (profileUpdateError) {
      console.error(
        '[auth/login] profile update:',
        profileUpdateError
      );
    }

    /*
     * rate-limit.ts utilise encore l'ancien userId numérique.
     * On ne lui transmet donc pas l'UUID Supabase.
     */
    await recordLoginAttempt({
      email,
      userId: null,
      ip,
      success: true,
      reason: null,
    });

    await createAuditLog({
      userId: authUserId,
      action: 'LOGIN_SUCCESS',
      description: 'Connexion réussie',
      metadata: { email },
      ip,
      userAgent,
      result: 'SUCCESS',
    });

    try {
      await insertNotification({
        type: 'info',
        category: 'SECURITY',
        title: 'Nouvelle connexion',
        message: 'Le compte vient de se connecter.',
        source: 'auth',
        target_url: '/audit',
        severity_score: 2,
        metadata: {
          email,
          ip,
        },
      });
    } catch (notificationError) {
      console.error(
        '[auth/login] notification:',
        notificationError
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        email: user.email,
        roleCode: user.roleCode,
        roleName: user.roleName,
        permissions: user.permissions,
        redirect: '/',
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);

    await createAuditLog({
      userId: null,
      action: 'LOGIN_FAILED',
      description:
        'Erreur interne lors de la connexion',
      metadata: {
        email,
        error:
          err instanceof Error
            ? err.message
            : 'unknown',
      },
      ip,
      userAgent,
      result: 'FAILED',
    });

    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
