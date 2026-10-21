import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);

  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');

  /*
   * Aucun code d'authentification fourni.
   */
  if (!code) {
    return NextResponse.redirect(
      new URL(
        '/login?error=INVALID_AUTH_CALLBACK',
        requestUrl.origin
      )
    );
  }

  /*
   * Client Supabase lié à la session/cookies du navigateur.
   */
  const supabase =
    await createSupabaseServerClient();

  /*
   * Échanger le code reçu dans l'email contre
   * une session Supabase.
   */
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error(
      '[auth/callback] Supabase exchange:',
      exchangeError
    );

    return NextResponse.redirect(
      new URL(
        '/login?error=AUTH_CALLBACK_FAILED',
        requestUrl.origin
      )
    );
  }

  /*
   * Récupérer l'utilisateur Supabase après
   * établissement de la session.
   */
  const {
    data: { user: authUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !authUser) {
    console.error(
      '[auth/callback] Utilisateur Supabase introuvable:',
      userError
    );

    return NextResponse.redirect(
      new URL(
        '/login?error=AUTH_USER_NOT_FOUND',
        requestUrl.origin
      )
    );
  }

  /*
   * Récupérer le profil applicatif.
   */
  const {
    data: profile,
    error: profileError,
  } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, email, pending_email'
    )
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      '[auth/callback] Profil:',
      profileError
    );

    return NextResponse.redirect(
      new URL(
        '/profile?error=PROFILE_LOAD_FAILED',
        requestUrl.origin
      )
    );
  }

  /*
   * ------------------------------------------------------
   * RÉCUPÉRATION DU MOT DE PASSE
   * ------------------------------------------------------
   */
  if (type === 'recovery') {
    return NextResponse.redirect(
      new URL(
        '/reset-password',
        requestUrl.origin
      )
    );
  }

  /*
   * ------------------------------------------------------
   * CHANGEMENT D'ADRESSE EMAIL
   * ------------------------------------------------------
   *
   * À ce stade :
   *
   * 1. Supabase a reçu le lien de confirmation.
   * 2. Le code a été échangé contre une session.
   * 3. authUser.email contient l'adresse confirmée.
   *
   * Nous vérifions que cette adresse correspond bien
   * à notre pending_email avant de modifier profiles.
   */
  if (type === 'email_change') {
    const confirmedEmail =
      String(authUser.email ?? '')
        .trim()
        .toLowerCase();

    /*
     * L'adresse confirmée doit exister.
     */
    if (!confirmedEmail) {
      console.error(
        '[auth/callback] Email confirmé introuvable.'
      );

      return NextResponse.redirect(
        new URL(
          '/profile?error=EMAIL_CONFIRMATION_FAILED',
          requestUrl.origin
        )
      );
    }

    /*
     * Le profil doit exister.
     */
    if (!profile) {
      console.error(
        '[auth/callback] Profil applicatif introuvable.'
      );

      return NextResponse.redirect(
        new URL(
          '/profile?error=PROFILE_NOT_FOUND',
          requestUrl.origin
        )
      );
    }

    /*
     * Adresse actuellement en attente.
     */
    const pendingEmail =
      String(profile.pending_email ?? '')
        .trim()
        .toLowerCase();

    /*
     * Il doit y avoir une demande en attente.
     */
    if (!pendingEmail) {
      console.error(
        '[auth/callback] Aucune demande de changement email en attente.'
      );

      return NextResponse.redirect(
        new URL(
          '/profile?error=NO_PENDING_EMAIL',
          requestUrl.origin
        )
      );
    }

    /*
     * Sécurité :
     *
     * L'adresse confirmée par Supabase doit être
     * exactement celle qui avait été demandée.
     */
    if (confirmedEmail !== pendingEmail) {
      console.error(
        '[auth/callback] Email confirmé différent de pending_email:',
        {
          confirmedEmail,
          pendingEmail,
        }
      );

      return NextResponse.redirect(
        new URL(
          '/profile?error=EMAIL_CONFIRMATION_MISMATCH',
          requestUrl.origin
        )
      );
    }

    /*
     * Confirmation réussie.
     *
     * Synchroniser le profil applicatif avec
     * Supabase Auth.
     */
    const now =
      new Date().toISOString();

    const {
      error: syncError,
    } = await supabaseAdmin
      .from('profiles')
      .update({
        email: confirmedEmail,
        pending_email: null,
        email_verified_at: now,
        updated_at: now,
        profile_updated_at: now,
      })
      .eq('id', authUser.id);

    if (syncError) {
      console.error(
        '[auth/callback] Synchronisation email:',
        syncError
      );

      return NextResponse.redirect(
        new URL(
          '/profile?error=EMAIL_SYNC_FAILED',
          requestUrl.origin
        )
      );
    }

    /*
     * Changement confirmé avec succès.
     */
    return NextResponse.redirect(
      new URL(
        '/profile?email=confirmed',
        requestUrl.origin
      )
    );
  }

  /*
   * ------------------------------------------------------
   * CONFIRMATION STANDARD
   * ------------------------------------------------------
   *
   * Par exemple, confirmation initiale du compte.
   */
  return NextResponse.redirect(
    new URL(
      '/?auth=confirmed',
      requestUrl.origin
    )
  );
}
