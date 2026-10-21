import { supabaseAdmin } from '@/lib/supabase/admin';

export type NotificationRow = {
  id: number;
  type: 'critical' | 'warning' | 'info' | 'success';
  category: string;
  title: string;
  message: string;
  source: string | null;
  severity_score: number;
  target_url: string | null;
  metadata: string | null;
  is_read: number;
  created_at: string;
  read_at: string | null;
};

export interface CountResult {
  unread: number;
  critical: number;
  warning: number;
}

/**
 * Normalise une ligne Supabase vers le format attendu
 * par le reste de l'application.
 */
function normalizeNotification(row: any): NotificationRow {
  return {
    id: Number(row.id),
    type: row.type,
    category: row.category,
    title: row.title,
    message: row.message,
    source: row.source ?? null,
    severity_score: Number(row.severity_score ?? 0),
    target_url: row.target_url ?? null,

    metadata:
      row.metadata == null
        ? null
        : typeof row.metadata === 'string'
          ? row.metadata
          : JSON.stringify(row.metadata),

    is_read: row.is_read ? 1 : 0,
    created_at: row.created_at,
    read_at: row.read_at ?? null,
  };
}

/**
 * Liste les notifications.
 */
export async function listNotifications(
  opts: {
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
    category?: string;
  } = {}
): Promise<NotificationRow[]> {
  const limit = Math.min(
    Math.max(Number(opts.limit) || 100, 1),
    500
  );

  let query = supabaseAdmin
    .from('notifications')
    .select(
      `
        id,
        type,
        category,
        title,
        message,
        source,
        severity_score,
        target_url,
        metadata,
        is_read,
        created_at,
        read_at
      `
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.unreadOnly) {
    query = query.eq('is_read', false);
  }

  if (opts.type) {
    query = query.eq('type', opts.type);
  }

  if (opts.category) {
    query = query.eq('category', opts.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      '[notifications-db] listNotifications:',
      error
    );

    throw error;
  }

  const rows = (data ?? []).map(normalizeNotification);

  /**
   * Même ordre de priorité que l'ancien MySQL :
   *
   * critical → warning → info → success
   */
  const priority: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };

  rows.sort((a, b) => {
    const priorityDiff =
      (priority[a.type] ?? 99) -
      (priority[b.type] ?? 99);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    );
  });

  return rows;
}

/**
 * Retourne les compteurs de notifications non lues.
 */
export async function getCounts(): Promise<CountResult> {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('type, is_read');

  if (error) {
    console.error(
      '[notifications-db] getCounts:',
      error
    );

    throw error;
  }

  let unread = 0;
  let critical = 0;
  let warning = 0;

  for (const row of data ?? []) {
    const isUnread = !row.is_read;

    if (!isUnread) {
      continue;
    }

    unread++;

    if (row.type === 'critical') {
      critical++;
    }

    if (row.type === 'warning') {
      warning++;
    }
  }

  return {
    unread,
    critical,
    warning,
  };
}

/**
 * Marque une notification comme lue.
 */
export async function markRead(
  id: number | string
) {
  const notificationId = Number(id);

  if (!Number.isFinite(notificationId)) {
    throw new Error(
      'ID de notification invalide.'
    );
  }

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (error) {
    console.error(
      '[notifications-db] markRead:',
      error
    );

    throw error;
  }
}

/**
 * Marque toutes les notifications non lues comme lues.
 */
export async function markAllRead() {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('is_read', false);

  if (error) {
    console.error(
      '[notifications-db] markAllRead:',
      error
    );

    throw error;
  }
}

/**
 * Insère une notification classique.
 */
export async function insertNotification(
  notif: {
    type: string;
    category: string;
    title: string;
    message: string;
    source?: string | null;
    severity_score?: number;
    target_url?: string | null;
    metadata?: unknown;
  }
) {
  const metadata =
    notif.metadata == null
      ? null
      : notif.metadata;

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      type: notif.type,
      category: notif.category,
      title: notif.title,
      message: notif.message,
      source: notif.source ?? null,
      severity_score:
        notif.severity_score ?? 0,
      target_url:
        notif.target_url ?? null,
      metadata,
      is_read: false,
      read_at: null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(
      '[notifications-db] insertNotification:',
      error
    );

    throw error;
  }

  return Number(data.id);
}

/**
 * Insère une notification avec déduplication.
 *
 * La clé unique est stockée dans :
 *
 * metadata.dedup_key
 *
 * Exemple :
 *
 * {
 *   "dedup_key": "sys:import:2"
 * }
 *
 * La recherche est effectuée directement sur la valeur
 * JSONB avec :
 *
 * metadata->>dedup_key
 *
 * afin d'être compatible PostgreSQL / Supabase.
 */
export async function insertNotificationDedup(
  notif: {
    type: string;
    category: string;
    title: string;
    message: string;
    source?: string | null;
    severity_score?: number;
    target_url?: string | null;
    metadata?: unknown;
    dedupKey: string;
  }
) {
  /**
   * Prépare les métadonnées.
   *
   * On conserve les métadonnées existantes si elles sont
   * déjà un objet JSON.
   */
  const baseMetadata =
    notif.metadata &&
    typeof notif.metadata === 'object' &&
    !Array.isArray(notif.metadata)
      ? (notif.metadata as Record<string, unknown>)
      : {};

  const metadata = {
    ...baseMetadata,
    dedup_key: notif.dedupKey,
  };

  /**
   * Recherche directe dans le JSONB :
   *
   * metadata->>'dedup_key'
   *
   * C'est l'équivalent PostgreSQL de la recherche
   * JSON_EXTRACT utilisée précédemment avec MySQL.
   */
  const {
    data: existing,
    error: existingError,
  } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq(
      'metadata->>dedup_key',
      notif.dedupKey
    )
    .limit(1);

  if (existingError) {
    console.error(
      '[notifications-db] insertNotificationDedup check:',
      existingError
    );

    throw existingError;
  }

  /**
   * Notification déjà présente :
   * on ne la recrée pas.
   */
  if (existing && existing.length > 0) {
    return null;
  }

  /**
   * Nouvelle notification.
   */
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      type: notif.type,
      category: notif.category,
      title: notif.title,
      message: notif.message,
      source: notif.source ?? null,
      severity_score:
        notif.severity_score ?? 0,
      target_url:
        notif.target_url ?? null,
      metadata,
      is_read: false,
      read_at: null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(
      '[notifications-db] insertNotificationDedup insert:',
      error
    );

    throw error;
  }

  return Number(data.id);
}

/**
 * Réouvre une notification précédemment lue.
 *
 * Recherche par metadata.dedup_key.
 */
export async function setNotificationReopened(
  dedupKey: string
) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({
      is_read: false,
      read_at: null,
    })
    .eq(
      'metadata->>dedup_key',
      dedupKey
    )
    .eq('is_read', true);

  if (error) {
    console.error(
      '[notifications-db] setNotificationReopened:',
      error
    );

    throw error;
  }
}
