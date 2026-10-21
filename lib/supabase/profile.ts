import { supabaseAdmin } from '@/lib/supabase/admin';

export async function getSupabaseAppUser(authUserId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, legacy_user_id, first_name, last_name, display_name, email, role_id, department_id, agency_id, job_title, phone, avatar, status')
    .eq('id', authUserId)
    .maybeSingle();

  if (error) throw error;

  if (profile === null) return null;

  const currentProfile = profile;

  let roleCode = '';
  let roleName = null;

  if (currentProfile.role_id) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('id, code, name')
      .eq('id', currentProfile.role_id)
      .maybeSingle();

    if (roleError) throw roleError;

    roleCode = role?.code ?? '';
    roleName = role?.name ?? null;
  }

  let agencyName = null;

  if (currentProfile.agency_id) {
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .select('id, name')
      .eq('id', currentProfile.agency_id)
      .maybeSingle();

    if (agencyError) throw agencyError;

    agencyName = agency?.name ?? null;
  }

  const permissions = await getSupabaseEffectivePermissions(
    authUserId,
    currentProfile.role_id,
    roleCode
  );

  return {
    id: currentProfile.id,
    legacyUserId: currentProfile.legacy_user_id == null
      ? null
      : Number(currentProfile.legacy_user_id),
    firstName: currentProfile.first_name,
    lastName: currentProfile.last_name,
    displayName: currentProfile.display_name,
    email: currentProfile.email,
    roleId: currentProfile.role_id == null ? null : Number(currentProfile.role_id),
    roleCode,
    roleName,
    status: currentProfile.status,
    departmentId: currentProfile.department_id == null
      ? null
      : Number(currentProfile.department_id),
    agencyId: currentProfile.agency_id == null
      ? null
      : Number(currentProfile.agency_id),
    agencyName,
    jobTitle: currentProfile.job_title,
    phone: currentProfile.phone,
    avatar: currentProfile.avatar,
    permissions,
  };
}

export async function getSupabaseEffectivePermissions(
  authUserId: string,
  roleId: number | null,
  roleCode: string
): Promise<string[]> {
  const { data: allPermissions, error: allError } = await supabaseAdmin
    .from('permissions')
    .select('id, code');

  if (allError) throw allError;

  if (roleCode === 'SUPER_ADMIN') {
    return (allPermissions ?? []).map((p) => p.code);
  }

  const effective = new Set<string>();

  if (roleId) {
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleId);

    if (roleError) throw roleError;

    const ids = (roleRows ?? []).map((r) => r.permission_id);

    for (const permission of allPermissions ?? []) {
      if (ids.includes(permission.id)) {
        effective.add(permission.code);
      }
    }
  }

  const { data: overrides, error: overrideError } = await supabaseAdmin
    .from('user_permissions')
    .select('permission_id, granted')
    .eq('user_id', authUserId);

  if (overrideError) throw overrideError;

  for (const override of overrides ?? []) {
    const permission = (allPermissions ?? []).find(
      (p) => p.id === override.permission_id
    );


    if (permission === undefined) {
      continue;
    }

    if (override.granted) {
      effective.add(permission.code);
    } else {
      effective.delete(permission.code);
    }
  }

  return Array.from(effective);
}
