import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { getUserById, isSuperAdmin } from '@/lib/users/users';
import { getUserPermissions, setUserPermission, listPermissions } from '@/lib/users/roles';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/users/[id]/permissions — permissions individuelles + permissions effectives
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'users.view');
    const { id } = await ctx.params;
    const targetId = Number(id);
    const target = await getUserById(targetId);
    if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

    const rolePerms = await listPermissions();
    const individual = await getUserPermissions(targetId);
    const individualMap: Record<string, boolean> = {};
    for (const r of individual) individualMap[r.code] = Number(r.granted) === 1;

    return NextResponse.json({
      ok: true,
      data: {
        roleCode: target.role_code,
        roleName: target.role_name,
        permissions: rolePerms,
        individual: individualMap,
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// PUT /api/users/[id]/permissions — { code, granted }
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'users.update');
    const { id } = await ctx.params;
    const targetId = Number(id);
    const body = await req.json();
    const code = String(body.code || '');
    const granted = Boolean(body.granted);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent');

    if (!code) return NextResponse.json({ ok: false, error: 'VALIDATION_ERROR' }, { status: 422 });

    const target = await getUserById(targetId);
    if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

    // Règle absolue : on ne retire jamais de permission au SUPER_ADMIN
    if (target.role_code === 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN', message: 'Le compte administrateur principal possède tous les droits.' }, { status: 403 });
    }

    const ok = await setUserPermission(targetId, code, granted, actor.id);
    if (!ok) return NextResponse.json({ ok: false, error: 'NOT_FOUND', message: 'Permission inconnue.' }, { status: 404 });

    await createAuditLog({
      userId: actor.id, action: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED',
      targetType: 'USER', targetId,
      description: `${granted ? 'Attribution' : 'Retrait'} de la permission ${code} pour ${target.display_name || target.id}`,
      oldValues: { permission: code, granted: !granted }, newValues: { permission: code, granted },
      ip, userAgent, result: 'SUCCESS',
    });

    return NextResponse.json({ ok: true, data: { code, granted } });
  } catch (err) {
    return authErrorResponse(err);
  }
}