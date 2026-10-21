import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { getUserById, setUserStatus, isSuperAdmin } from '@/lib/users/users';
import { insertNotification } from '@/lib/notifications-db';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/users/[id]/status — { status: 'SUSPENDED' | 'ACTIVE' | 'DISABLED' | 'INVITED' }
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'users.disable');
    const { id } = await ctx.params;
    const targetId = Number(id);
    const body = await req.json();
    const status = String(body.status || '');
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent');

    const valid = ['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED'];
    if (!valid.includes(status)) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_ERROR' }, { status: 422 });
    }

    const target = await getUserById(targetId);
    if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

    // Règle absolue : impossible de suspendre/désactiver le compte DG (SUPER_ADMIN)
    if (target.role_code === 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN', message: 'Le compte administrateur principal ne peut pas être suspendu ni désactivé.' }, { status: 403 });
    }

    const oldStatus = target.status;
    await setUserStatus(targetId, status);

    const actionMap: Record<string, string> = {
      SUSPENDED: 'USER_SUSPENDED',
      ACTIVE: 'USER_REACTIVATED',
      DISABLED: 'USER_DISABLED',
      INVITED: 'USER_REINVITED',
    };
    const labelMap: Record<string, string> = {
      SUSPENDED: 'Suspension du compte',
      ACTIVE: 'Réactivation du compte',
      DISABLED: 'Désactivation du compte',
      INVITED: 'Ré-invitation du compte',
    };

    await createAuditLog({
      userId: actor.id, action: actionMap[status], targetType: 'USER', targetId,
      description: `${labelMap[status]} de ${target.display_name || target.id}`,
      oldValues: { status: oldStatus }, newValues: { status }, ip, userAgent, result: 'SUCCESS',
    });

    await insertNotification({
      type: status === 'SUSPENDED' ? 'warning' : 'info',
      category: 'SECURITY',
      title: `${labelMap[status]}`,
      message: `${target.display_name || target.id} — statut : ${status}.`,
      source: 'users', target_url: `/users/${targetId}`, severity_score: status === 'SUSPENDED' ? 5 : 2,
      metadata: { userId: targetId, status, byUserId: actor.id },
    });

    return NextResponse.json({ ok: true, data: { id: targetId, status } });
  } catch (err) {
    return authErrorResponse(err);
  }
}