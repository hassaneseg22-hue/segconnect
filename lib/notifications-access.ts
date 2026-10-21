import { getUserPermissionsSet } from '@/lib/auth/auth';
import type { NotificationRow } from '@/lib/notifications-db';

/* =====================================================================
 * Contrôle d'accès aux notifications (correctif P0 de l'audit).
 *
 * - Lecture : utilisateur connecté avec notifications.view ou dashboard.view
 *   (la cloche et le bandeau d'actualités sont affichés sur le tableau de bord).
 * - Catégories sensibles (SECURITY, USERS) : réservées aux comptes ayant
 *   audit.view, users.view ou notifications.view.
 * - Les métadonnées ne sont jamais renvoyées avec des jetons, mots de passe
 *   ou secrets (ex. jeton d'invitation d'un nouvel utilisateur).
 * ===================================================================== */

type User = Parameters<typeof getUserPermissionsSet>[0];

const SENSITIVE_CATEGORIES = new Set(['SECURITY', 'USERS']);
const SECRET_KEY = /(token|password|passwd|secret|otp|code_activation|invitation)/i;

export async function notificationAccess(user: User) {
  const all = (user as { role_code?: string }).role_code === 'SUPER_ADMIN';
  const set = all ? new Set<string>() : await getUserPermissionsSet(user);
  const has = (code: string) => all || set.has(code);
  return {
    canRead: has('notifications.view') || has('dashboard.view'),
    canManage: has('notifications.view'),
    canSeeSensitive: has('audit.view') || has('users.view') || has('notifications.view'),
  };
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

export function sanitizeNotifications(rows: NotificationRow[], canSeeSensitive: boolean): NotificationRow[] {
  return rows
    .filter((n) => canSeeSensitive || !SENSITIVE_CATEGORIES.has(String(n.category ?? '').toUpperCase()))
    .map((n) => {
      if (n.metadata == null) return n;
      let metadata: string | null = null;
      try {
        metadata = JSON.stringify(scrub(JSON.parse(n.metadata)));
      } catch {
        metadata = null; // métadonnée illisible : non transmise
      }
      return { ...n, metadata };
    });
}
