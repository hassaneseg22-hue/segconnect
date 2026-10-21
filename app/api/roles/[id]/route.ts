import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { getRoleById, getRolePermissions } from '@/lib/users/roles';
import { getPool } from '@/lib/mysql';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/roles/[id] — détail d'un rôle + ses permissions
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'roles.view');
    const { id } = await ctx.params;
    const role = await getRoleById(Number(id));
    if (!role) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    const permissions = await getRolePermissions(Number(id));
    return NextResponse.json({ ok: true, data: { role, permissions } });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// PATCH /api/roles/[id] — renommer / décrire un rôle (système : permissions bloquées)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'roles.update');
    const { id } = await ctx.params;
    const roleId = Number(id);
    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const description = body.description !== undefined ? String(body.description || '') : undefined;

    const role = await getRoleById(roleId);
    if (!role) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    // Le rôle SUPER_ADMIN n'est jamais renommable (règle absolue)
    if (role.code === 'SUPER_ADMIN' && name !== 'Administrateur principal') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN', message: 'Le rôle SUPER_ADMIN est immuable.' }, { status: 403 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent');
    const db = getPool();
    if (name !== undefined && name) await db.query('UPDATE roles SET name = ? WHERE id = ?', [name, roleId]);
    if (description !== undefined) await db.query('UPDATE roles SET description = ? WHERE id = ?', [description, roleId]);

    await createAuditLog({
      userId: actor.id, action: 'ROLE_UPDATED', targetType: 'ROLE', targetId: roleId,
      description: `Modification du rôle ${role.name}`,
      oldValues: { name: role.name, description: role.description },
      newValues: { name, description }, ip, userAgent, result: 'SUCCESS',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}