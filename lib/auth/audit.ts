import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuditResult = 'SUCCESS' | 'FAILED';

export interface AuditLogOptions {
  userId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  description: string;
  metadata?: unknown;
  oldValues?: unknown;
  newValues?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  result?: AuditResult;
}

/**
 * Création d'une entrée dans audit_logs.
 *
 * L'audit ne doit jamais bloquer l'opération métier.
 */
export async function createAuditLog(
  opts: AuditLogOptions
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: opts.userId ?? null,
        action: opts.action,
        target_type: opts.targetType ?? null,
        target_id:
          opts.targetId != null
            ? String(opts.targetId)
            : null,
        description: opts.description,
        metadata:
          opts.metadata != null
            ? opts.metadata
            : null,
        old_values:
          opts.oldValues != null
            ? opts.oldValues
            : null,
        new_values:
          opts.newValues != null
            ? opts.newValues
            : null,
        ip_address: opts.ip ?? null,
        user_agent: opts.userAgent ?? null,
        result: opts.result ?? 'SUCCESS',
      });

    if (error) {
      console.error(
        '[audit] Impossible de créer le journal:',
        error
      );
    }
  } catch (error) {
    /**
     * L'audit ne doit jamais empêcher
     * l'opération métier principale.
     */
    console.error(
      '[audit] Erreur inattendue:',
      error
    );
  }
}

/**
 * Liste paginée des journaux d'audit.
 */
export async function listAuditLogs(
  opts: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    userId?: string | number;
    from?: string;
    to?: string;
  } = {}
) {
  const page = Math.max(
    1,
    Number(opts.page) || 1
  );

  const limit = Math.min(
    100,
    Math.max(
      1,
      Number(opts.limit) || 25
    )
  );

  const offset = (page - 1) * limit;

  /**
   * On récupère les logs.
   *
   * Les filtres sont appliqués côté serveur
   * avec les capacités Supabase/PostgreSQL.
   */
  let query = supabaseAdmin
    .from('audit_logs')
    .select(
      `
        id,
        user_id,
        action,
        target_type,
        target_id,
        description,
        metadata,
        old_values,
        new_values,
        ip_address,
        user_agent,
        result,
        created_at
      `,
      {
        count: 'exact',
      }
    )
    .order('created_at', {
      ascending: false,
    })
    .range(
      offset,
      offset + limit - 1
    );

  if (opts.action) {
    query = query.eq(
      'action',
      opts.action
    );
  }

  if (opts.userId) {
    query = query.eq(
      'user_id',
      String(opts.userId)
    );
  }

  if (opts.from) {
    query = query.gte(
      'created_at',
      `${opts.from}T00:00:00`
    );
  }

  if (opts.to) {
    query = query.lte(
      'created_at',
      `${opts.to}T23:59:59`
    );
  }

  if (opts.search) {
    const search =
      opts.search.trim();

    if (search) {
      query = query.or(
        [
          `description.ilike.%${search}%`,
          `action.ilike.%${search}%`,
        ].join(',')
      );
    }
  }

  const {
    data,
    error,
    count,
  } = await query;

  if (error) {
    throw error;
  }

  const rows = data ?? [];

  /**
   * Le nouveau schéma Supabase stocke directement
   * les valeurs JSON sous forme JSONB.
   */
  return {
    items: rows.map((row) => ({
      ...row,
      metadata:
        row.metadata ?? null,
      old_values:
        row.old_values ?? null,
      new_values:
        row.new_values ?? null,
    })),

    total: count ?? 0,

    page,

    limit,
  };
}
