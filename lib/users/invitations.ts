import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Résout l'UUID du profil à partir :
 * - d'un UUID Supabase
 * - ou de l'ancien legacy_user_id
 */
async function resolveProfileId(
  userId: number | string
): Promise<string | null> {
  const value = String(userId).trim();

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(value)) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', value)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.id ?? null;
  }

  const legacyUserId = Number(value);

  if (!Number.isInteger(legacyUserId)) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('legacy_user_id', legacyUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

/**
 * Récupère le profil associé à un utilisateur.
 */
async function getProfile(
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      legacy_user_id,
      first_name,
      last_name,
      display_name,
      email,
      status,
      role_id
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * Crée une invitation.
 *
 * IMPORTANT :
 * Supabase Auth gère directement les invitations.
 * Aucun stockage local du token n'est nécessaire.
 * On utilise donc l'API Admin de Supabase Auth :
 *
 * generateLink({
 *   type: 'invite',
 *   email
 * })
 *
 * L'utilisateur recevra le lien d'invitation selon
 * la configuration email de Supabase.
 *
 * La fonction retourne l'URL générée afin de conserver
 * la compatibilité avec le système existant.
 */
export async function createInvitation(
  userId: number | string,
  _hours = 72
): Promise<string> {
  const profileId = await resolveProfileId(userId);

  if (!profileId) {
    throw new Error(
      `Utilisateur introuvable : ${String(userId)}`
    );
  }

  const profile = await getProfile(profileId);

  if (!profile) {
    throw new Error('Profil introuvable');
  }

  if (!profile.email) {
    throw new Error(
      'Impossible de créer une invitation sans adresse email'
    );
  }

  /**
   * Génération du lien d'invitation Supabase.
   *
   * Le TTL exact du lien est contrôlé par Supabase Auth.
   * Le paramètre _hours est conservé pour compatibilité
   * avec l'ancienne signature.
   */
  const { data, error } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: profile.email,
      options: {
        redirectTo:
          process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
            : undefined,
      },
    });

  if (error) {
    throw error;
  }

  if (!data?.properties?.action_link) {
    throw new Error(
      'Supabase n’a pas retourné de lien d’invitation'
    );
  }

  return data.properties.action_link;
}

/**
 * Récupère les informations d'une invitation.
 *
 * Avec Supabase Auth, le token de l'invitation est
 * vérifié par Supabase au travers du callback Auth.
 *
 * Cette fonction reste disponible pour compatibilité
 * avec les anciennes routes.
 */
export async function getInvitation(
  rawToken: string
) {
  const token = String(rawToken || '').trim();

  if (!token) {
    return null;
  }

  /**
   * Le token Supabase n'est pas stocké dans une table
   * locale et ne doit donc pas être hashé/recherché
   * dans user_invitations.
   *
   * La validation doit être effectuée par le callback
   * Supabase Auth.
   */
  return null;
}

/**
 * Active un compte après acceptation d'une invitation.
 *
 * Le mot de passe est enregistré directement dans
 * Supabase Auth.
 */
export async function activateAccount(
  rawToken: string,
  password: string
) {
  const token = String(rawToken || '').trim();
  const nextPassword = String(password || '');

  if (!token) {
    return {
      ok: false as const,
      reason: 'INVALID_TOKEN',
    };
  }

  if (nextPassword.length < 8) {
    return {
      ok: false as const,
      reason: 'WEAK_PASSWORD',
    };
  }

  /**
   * Un token d'invitation Supabase doit normalement être
   * consommé par le callback Auth.
   *
   * Cette fonction ne peut pas transformer arbitrairement
   * le token en user UUID.
   */
  return {
    ok: false as const,
    reason: 'SUPABASE_AUTH_CONFIRMATION_REQUIRED',
  };
}

/**
 * Demande de réinitialisation de mot de passe.
 *
 * Supabase Auth génère et gère le token.
 */
export async function createPasswordReset(
  email: string
): Promise<string> {
  const normalizedEmail = String(email)
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    return '';
  }

  /**
   * Vérifier que le compte applicatif existe.
   */
  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from('profiles')
      .select('id, email, status')
      .ilike('email', normalizedEmail)
      .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile) {
    return '';
  }

  if (profile.status !== 'ACTIVE') {
    return '';
  }

  /**
   * Génère le lien de récupération via Supabase Auth.
   *
   * Le token n'est jamais stocké localement.
   */
  const { data, error } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo:
          process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?type=recovery`
            : undefined,
      },
    });

  if (error) {
    throw error;
  }

  return data?.properties?.action_link ?? '';
}

/**
 * Réinitialise le mot de passe.
 *
 * Le token Supabase doit être consommé par le callback
 * Auth, qui établit ensuite une session permettant
 * la modification du mot de passe.
 */
export async function resetPassword(
  rawToken: string,
  password: string
) {
  const token = String(rawToken || '').trim();
  const nextPassword = String(password || '');

  if (!token) {
    return {
      ok: false as const,
    };
  }

  if (nextPassword.length < 8) {
    return {
      ok: false as const,
      reason: 'WEAK_PASSWORD',
    };
  }

  /**
   * Le token recovery Supabase n'est pas une valeur que
   * nous devons rechercher dans une table locale.
   *
   * Le callback Auth doit d'abord établir la session.
   */
  return {
    ok: false as const,
    reason: 'SUPABASE_AUTH_CONFIRMATION_REQUIRED',
  };
}
