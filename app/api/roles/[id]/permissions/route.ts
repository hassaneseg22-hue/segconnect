import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { getRoleById, getRolePermissions, setRolePermissions } from '@/lib/users/roles';

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/roles/[id]/permissions — remplacer les permissions d'un rôle
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'roles.permissions');
    const { id } = await ctx.params;
    const roleId = Number(id);
    const body = await req.json();
    const permissionCodes: string[] = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent');

    const role = await getRoleById(roleId);
    if (!role) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    // Le SUPER_ADMIN garde 100% des permissions (règle absolue)
    if (role.code === 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN', message: 'Les permissions du rôle SUPER_ADMIN ne peuvent pas être modifiées.' }, { status: 403 });
    }

    const oldPerms = await getRolePermissions(roleId);
    await setRolePermissions(roleId, permissionCodes);

    await createAuditLog({
      userId: actor.id, action: 'ROLE_PERMISSIONS_UPDATED', targetType: 'ROLE', targetId: roleId,
      description: `Mise à jour des permissions du rôle ${role.name}`,
      oldValues: { permissions: oldPerms }, newValues: { permissions: permissionCodes },
      ip, userAgent, result: 'SUCCESS',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}