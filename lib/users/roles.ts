import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Résout un utilisateur applicatif à partir :
 * - soit de son UUID Supabase Auth / profiles.id
 * - soit de son ancien legacy_user_id
 */
async function resolveProfileId(userId: number | string): Promise<string | null> {
  const value = String(userId).trim();

  // UUID Supabase
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', value)
      .maybeSingle();

    if (error) throw error;

    return data?.id ?? null;
  }

  // Ancien identifiant numérique
  const legacyUserId = Number(value);

  if (!Number.isInteger(legacyUserId)) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('legacy_user_id', legacyUserId)
    .maybeSingle();

  if (error) throw error;

  return data?.id ?? null;
}

/**
 * Liste tous les rôles avec le nombre d'utilisateurs associés.
 */
export async function listRoles() {
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('roles')
    .select(
      'id, name, code, description, is_system_role, created_at'
    )
    .order('id', { ascending: true });

  if (rolesError) {
    throw rolesError;
  }

  if (!roles?.length) {
    return [];
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, role_id');

  if (profilesError) {
    throw profilesError;
  }

  const userCountByRole = new Map<number, number>();

  for (const profile of profiles ?? []) {
    if (profile.role_id == null) {
      continue;
    }

    const roleId = Number(profile.role_id);

    userCountByRole.set(
      roleId,
      (userCountByRole.get(roleId) ?? 0) + 1
    );
  }

  return roles.map((role) => ({
    ...role,
    user_count: userCountByRole.get(Number(role.id)) ?? 0,
  }));
}

/**
 * Récupère un rôle par son ID.
 */
export async function getRoleById(id: number) {
  const { data, error } = await supabaseAdmin
    .from('roles')
    .select(
      'id, name, code, description, is_system_role, created_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * Récupère un rôle par son code.
 */
export async function getRoleByCode(code: string) {
  const { data, error } = await supabaseAdmin
    .from('roles')
    .select(
      'id, name, code, description, is_system_role, created_at'
    )
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * Liste les permissions.
 *
 * Exemple :
 * listPermissions()
 * listPermissions({ module: 'DASHBOARD' })
 */
export async function listPermissions(
  opts: { module?: string } = {}
) {
  let query = supabaseAdmin
    .from('permissions')
    .select(
      'id, name, code, module_code, action, description'
    )
    .order('module_code', { ascending: true })
    .order('action', { ascending: true });

  if (opts.module) {
    query = query.eq('module_code', opts.module);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Récupère les codes des permissions d'un rôle.
 */
export async function getRolePermissions(roleId: number) {
  const { data: rolePermissions, error: rolePermissionsError } =
    await supabaseAdmin
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleId);

  if (rolePermissionsError) {
    throw rolePermissionsError;
  }

  if (!rolePermissions?.length) {
    return [];
  }

  const permissionIds = rolePermissions.map(
    (row) => row.permission_id
  );

  const { data: permissions, error: permissionsError } =
    await supabaseAdmin
      .from('permissions')
      .select(
        'id, code, module_code, action'
      )
      .in('id', permissionIds);

  if (permissionsError) {
    throw permissionsError;
  }

  return (permissions ?? []).map(
    (permission) => permission.code
  );
}

/**
 * Remplace toutes les permissions d'un rôle.
 */
export async function setRolePermissions(
  roleId: number,
  permissionCodes: string[]
) {
  // Vérification du rôle
  const { data: role, error: roleError } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('id', roleId)
    .maybeSingle();

  if (roleError) {
    throw roleError;
  }

  if (!role) {
    throw new Error(`Rôle introuvable : ${roleId}`);
  }

  // Nettoyage des codes
  const uniqueCodes = Array.from(
    new Set(
      permissionCodes
        .map((code) => String(code).trim())
        .filter(Boolean)
    )
  );

  // Supprimer les anciennes permissions
  const { error: deleteError } = await supabaseAdmin
    .from('role_permissions')
    .delete()
    .eq('role_id', roleId);

  if (deleteError) {
    throw deleteError;
  }

  if (!uniqueCodes.length) {
    return;
  }

  // Récupérer les permissions correspondantes
  const { data: permissions, error: permissionsError } =
    await supabaseAdmin
      .from('permissions')
      .select('id, code')
      .in('code', uniqueCodes);

  if (permissionsError) {
    throw permissionsError;
  }

  if (!permissions?.length) {
    return;
  }

  // Préparer les associations
  const rows = permissions.map((permission) => ({
    role_id: roleId,
    permission_id: permission.id,
  }));

  // Insérer en une seule opération
  const { error: insertError } = await supabaseAdmin
    .from('role_permissions')
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

/**
 * Récupère les permissions spécifiques d'un utilisateur.
 */
export async function getUserPermissions(
  userId: number | string
) {
  const profileId = await resolveProfileId(userId);

  if (!profileId) {
    return [];
  }

  const { data: userPermissions, error: userPermissionsError } =
    await supabaseAdmin
      .from('user_permissions')
      .select('permission_id, granted')
      .eq('user_id', profileId);

  if (userPermissionsError) {
    throw userPermissionsError;
  }

  if (!userPermissions?.length) {
    return [];
  }

  const permissionIds = userPermissions.map(
    (row) => row.permission_id
  );

  const { data: permissions, error: permissionsError } =
    await supabaseAdmin
      .from('permissions')
      .select('id, code')
      .in('id', permissionIds);

  if (permissionsError) {
    throw permissionsError;
  }

  const permissionMap = new Map(
    (permissions ?? []).map((permission) => [
      permission.id,
      permission.code,
    ])
  );

  return userPermissions.map((row) => ({
    code: permissionMap.get(row.permission_id) ?? '',
    granted: Boolean(row.granted),
  }));
}

/**
 * Définit ou modifie une permission spécifique pour un utilisateur.
 */
export async function setUserPermission(
  userId: number | string,
  permissionCode: string,
  granted: boolean,
  createdBy: number | string
) {
  const profileId = await resolveProfileId(userId);

  if (!profileId) {
    throw new Error(
      `Utilisateur introuvable : ${String(userId)}`
    );
  }

  const creatorProfileId = await resolveProfileId(createdBy);

  if (!creatorProfileId) {
    throw new Error(
      `Utilisateur créateur introuvable : ${String(createdBy)}`
    );
  }

  const { data: permission, error: permissionError } =
    await supabaseAdmin
      .from('permissions')
      .select('id')
      .eq('code', permissionCode)
      .maybeSingle();

  if (permissionError) {
    throw permissionError;
  }

  if (!permission) {
    return false;
  }

  /**
   * On vérifie d'abord si une ligne existe.
   *
   * Cela évite de dépendre d'une contrainte UNIQUE
   * qui pourrait ne pas encore exister dans Supabase.
   */
  const { data: existing, error: existingError } =
    await supabaseAdmin
      .from('user_permissions')
      .select('user_id, permission_id')
      .eq('user_id', profileId)
      .eq('permission_id', permission.id)
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from('user_permissions')
      .update({
        granted,
        created_by: creatorProfileId,
      })
      .eq('user_id', profileId)
      .eq('permission_id', permission.id);

    if (updateError) {
      throw updateError;
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from('user_permissions')
      .insert({
        user_id: profileId,
        permission_id: permission.id,
        granted,
        created_by: creatorProfileId,
      });

    if (insertError) {
      throw insertError;
    }
  }

  return true;
}

/**
 * Supprime toutes les permissions personnalisées
 * d'un utilisateur.
 */
export async function clearUserPermissions(
  userId: number | string
) {
  const profileId = await resolveProfileId(userId);

  if (!profileId) {
    return;
  }

  const { error } = await supabaseAdmin
    .from('user_permissions')
    .delete()
    .eq('user_id', profileId);

  if (error) {
    throw error;
  }
}
