import { NextResponse } from 'next/server';

import {
  getSessionUser,
  type SessionUser,
} from '@/lib/auth/session';

import { supabaseAdmin } from '@/lib/supabase/admin';

export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function getCurrentUserOrThrow(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiAuthError(
      'UNAUTHORIZED',
      'Authentification requise.'
    );
  }

  return user;
}

export async function requireAuth(): Promise<SessionUser> {
  return getCurrentUserOrThrow();
}

export class ApiAuthError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN',
    message: string
  ) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiAuthError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err.code === 'FORBIDDEN'
            ? 'FORBIDDEN'
            : 'UNAUTHORIZED',
      },
      {
        status:
          err.code === 'FORBIDDEN'
            ? 403
            : 401,
      }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: 'INTERNAL_SERVER_ERROR',
    },
    {
      status: 500,
    }
  );
}

export interface PermissionRow {
  id: number;
  code: string;
  module_code: string;
  action: string;
}

/**
 * Permissions effectives =
 *
 * 1. Permissions du rôle
 * 2. Permissions individuelles
 *
 * Une permission individuelle `granted = false`
 * retire explicitement une permission héritée du rôle.
 *
 * Une permission individuelle `granted = true`
 * ajoute explicitement une permission.
 *
 * SUPER_ADMIN possède automatiquement toutes les permissions.
 */
export async function getEffectivePermissions(
  userId: string,
  roleId: number | null,
  roleCode: string
): Promise<string[]> {
  /**
   * SUPER_ADMIN :
   * toutes les permissions existantes.
   */
  const {
    data: allPermissions,
    error: permissionsError,
  } = await supabaseAdmin
    .from('permissions')
    .select('id, code, module_code, action');

  if (permissionsError) {
    throw permissionsError;
  }

  const permissions = (allPermissions ?? []) as PermissionRow[];

  if (roleCode === 'SUPER_ADMIN') {
    return permissions.map(
      (permission) => permission.code
    );
  }

  const effective = new Set<string>();

  /**
   * Permissions héritées du rôle.
   */
  if (roleId !== null) {
    const {
      data: rolePermissions,
      error: rolePermissionsError,
    } = await supabaseAdmin
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleId);

    if (rolePermissionsError) {
      throw rolePermissionsError;
    }

    const permissionIds = new Set(
      (rolePermissions ?? []).map(
        (row) => row.permission_id
      )
    );

    for (const permission of permissions) {
      if (permissionIds.has(permission.id)) {
        effective.add(permission.code);
      }
    }
  }

  /**
   * Permissions individuelles.
   *
   * user_permissions.user_id est un UUID Supabase.
   */
  const {
    data: userPermissions,
    error: userPermissionsError,
  } = await supabaseAdmin
    .from('user_permissions')
    .select('permission_id, granted')
    .eq('user_id', userId);

  if (userPermissionsError) {
    throw userPermissionsError;
  }

  for (const override of userPermissions ?? []) {
    const permission = permissions.find(
      (item) =>
        item.id === override.permission_id
    );

    if (!permission) {
      continue;
    }

    if (override.granted === true) {
      effective.add(permission.code);
    } else {
      effective.delete(permission.code);
    }
  }

  return Array.from(effective);
}

export async function getUserPermissionsSet(
  user: SessionUser
): Promise<Set<string>> {
  const permissions = await getEffectivePermissions(
    user.id,
    user.role_id,
    user.role_code
  );

  return new Set(permissions);
}

export async function hasPermission(
  user: SessionUser,
  code: string
): Promise<boolean> {
  /**
   * SUPER_ADMIN = accès complet.
   */
  if (user.role_code === 'SUPER_ADMIN') {
    return true;
  }

  const permissions =
    await getUserPermissionsSet(user);

  return permissions.has(code);
}

export async function requirePermission(
  user: SessionUser,
  code: string
): Promise<void> {
  const allowed = await hasPermission(
    user,
    code
  );

  if (!allowed) {
    throw new ApiAuthError(
      'FORBIDDEN',
      `Permission requise : ${code}`
    );
  }
}

/**
 * Retourne uniquement les modules actifs accessibles
 * à l'utilisateur.
 */
export async function getModulesForUser(
  user: SessionUser
) {
  const permissions =
    await getUserPermissionsSet(user);

  const {
    data: modules,
    error,
  } = await supabaseAdmin
    .from('modules')
    .select(
      'code, name, route, icon, sort_order, is_active'
    )
    .eq('is_active', true)
    .order('sort_order', {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (modules ?? [])
    .map((module) => ({
      ...module,

      hasAccess:
        permissions.has(
          `${module.code}.view`
        ) ||
        permissions.has(
          `${module.code}.create`
        ),
    }))
    .filter(
      (module) => module.hasAccess
    );
}
