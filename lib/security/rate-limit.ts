import { supabaseAdmin } from '@/lib/supabase/admin';

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function recordLoginAttempt(opts: {
  email: string;
  userId: string | null;
  ip: string | null;
  success: boolean;
  reason: string | null;
}) {
  try {
    const { error } = await supabaseAdmin
      .from('login_attempts')
      .insert({
        email: opts.email,
        user_id: opts.userId,
        ip_address: opts.ip ?? null,
        success: opts.success,
        reason: opts.reason,
      });

    if (error) {
      console.error(
        '[rate-limit] Impossible d’enregistrer la tentative:',
        error
      );
    }
  } catch (error) {
    console.error(
      '[rate-limit] Erreur inattendue:',
      error
    );
  }
}

export async function isLoginBlocked(
  email: string,
  ip: string | null
): Promise<boolean> {
  const since = new Date(
    Date.now() - WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  let query = supabaseAdmin
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('success', false)
    .gte('created_at', since);

  if (ip) {
    query = query.eq('ip_address', ip);
  }

  const { count, error } = await query;

  if (error) {
    console.error(
      '[rate-limit] Impossible de vérifier le blocage:',
      error
    );

    // En cas de problème avec le système de rate-limit,
    // on ne bloque pas la connexion.
    return false;
  }

  return (count ?? 0) >= MAX_ATTEMPTS;
}
