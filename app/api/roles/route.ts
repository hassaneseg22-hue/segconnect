import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, hasPermission, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { listRoles, listPermissions, getRoleByCode } from '@/lib/users/roles';
import { getPool } from '@/lib/mysql';

// GET /api/roles — liste des rôles + catalogue de permissions
export async function GET() {
  try {
    const user = await requireAuth();
    // users.create a besoin des rôles pour créer un utilisateur
    const ok = (await hasPermission(user, 'roles.view')) || (await hasPermission(user, 'users.create'));
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    const roles = await listRoles();
    const permissions = await listPermissions();
    return NextResponse.json({ ok: true, data: { roles, permissions } });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// POST /api/roles — créer un rôle personnalisé (non système)
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'roles.create');
    const body = await req.json();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const permissionCodes: string[] = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent');

    if (!name) return NextResponse.json({ ok: false, error: 'VALIDATION_ERROR' }, { status: 422 });

    // Génère un code technique à partir du nom, en évitant les collisions
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    let code = base;
    let suffix = 1;
    while (await getRoleByCode(code)) {
      code = `${base}_${suffix++}`;
    }

    const db = getPool();
    const [res] = await db.query(
      `INSERT INTO roles (name, code, description, is_system_role, created_at, updated_at)
       VALUES (?, ?, ?, 0, NOW(), NOW())`,
      [name, code, description || null]
    );
    const roleId = (res as any).insertId as number;

    if (permissionCodes.length) {
      const { setRolePermissions } = await import('@/lib/users/roles');
      await setRolePermissions(roleId, permissionCodes);
    }

    await createAuditLog({
      userId: actor.id, action: 'ROLE_CREATED', targetType: 'ROLE', targetId: roleId,
      description: `Création du rôle ${name}`,
      metadata: { code, permissions: permissionCodes }, ip, userAgent, result: 'SUCCESS',
    });

    return NextResponse.json({ ok: true, data: { id: roleId, code } }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}