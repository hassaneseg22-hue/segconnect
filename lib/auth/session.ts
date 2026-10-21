import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAppUser } from '@/lib/supabase/profile';

/**
 * Compatibilité avec l'ancien système de session.
 *
 * Les sessions ne sont plus stockées dans une table `user_sessions`.
 * Elles sont désormais gérées par Supabase Auth.
 */
export const SESSION_COOKIE = 'sb-session';

/**
 * Ancienne durée de session conservée uniquement pour compatibilité
 * avec du code existant.
 *
 * La durée réelle de la session est gérée par Supabase Auth.
 */
export const SESSION_TTL_HOURS = 12;

export interface SessionUser {
  /**
   * UUID Supabase Auth / profiles.id
   */
  id: string;

  email: string;

  display_name: string | null;

  first_name: string;

  last_name: string;

  role_id: number;

  role_code: string;

  status: string;

  agency_id: number | null;

  department_id: number | null;

  avatar: string | null;

  job_title: string | null;

  phone: string | null;

  agency_name: string | null;

  permissions: string[];
}

/**
 * Création d'une session serveur.
 *
 * OBSOLÈTE :
 * Supabase Auth crée et gère désormais les sessions.
 *
 * Cette fonction est conservée pour éviter de casser d'éventuels
 * anciens imports dans le projet.
 */
export async function createServerSession(
  _userId: string | number,
  _ip: string,
  _userAgent: string
): Promise<{ rawToken: string; cookie: string }> {
  throw new Error(
    'createServerSession() est obsolète. Les sessions sont gérées par Supabase Auth.'
  );
}

/**
 * Récupère l'utilisateur actuellement authentifié.
 *
 * Fonctionnement :
 *
 * Supabase Auth
 *      ↓
 * authUser.id
 *      ↓
 * public.profiles
 *      ↓
 * roles
 *      ↓
 * permissions effectives
 */
export async function getSessionUser(
  _rawToken?: string
): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return null;
  }

  const user = await getSupabaseAppUser(authUser.id);

  if (!user) {
    return null;
  }

  /**
   * Seuls les comptes actifs peuvent accéder à l'application.
   */
  if (user.status !== 'ACTIVE') {
    return null;
  }

  return {
    id: user.id,

    email: user.email ?? authUser.email ?? '',

    display_name:
      user.displayName ??
      (
        `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
        null
      ),

    first_name: user.firstName ?? '',

    last_name: user.lastName ?? '',

    role_id: user.roleId ?? 0,

    role_code: user.roleCode ?? '',

    status: user.status,

    agency_id: user.agencyId,

    department_id: user.departmentId,

    avatar: user.avatar,

    job_title: user.jobTitle,

    phone: user.phone,

    agency_name: user.agencyName,

    permissions: user.permissions ?? [],
  };
}

/**
 * Révocation d'une session serveur.
 *
 * OBSOLÈTE :
 * il n'existe plus de session personnalisée `user_sessions`.
 *
 * Supabase Auth gère les sessions.
 */
export async function revokeServerSession(
  _rawToken?: string
): Promise<void> {
  // Gestion des sessions déléguée à Supabase Auth.
}

/**
 * Révoque les sessions d'un utilisateur.
 *
 * OBSOLÈTE :
 * le système actuel utilise Supabase Auth et non une table
 * locale `user_sessions`.
 *
 * Fonction conservée pour compatibilité avec l'ancien code.
 */
export async function revokeUserSessions(
  _userId: string | number
): Promise<void> {
  // Gestion des sessions déléguée à Supabase Auth.
}
