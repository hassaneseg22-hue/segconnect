import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { getPool } from '@/lib/mysql';
import { getUserById } from '@/lib/users/users';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/users/[id]/sessions — sessions actives d'un utilisateur
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'users.view');
    const { id } = await ctx.params;
    const targetId = Number(id);
    const db = getPool();
    const [rows] = await db.query<any[]>(
      `SELECT id, ip_address, user_agent, created_at, expires_at, last_activity_at
       FROM user_sessions
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY last_activity_at DESC`,
      [targetId]
    );
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// DELETE /api/users/[id]/sessions?sessionId=<id|null> — révoquer une ou toutes les sessions
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'users.disable');
    const { id } = await ctx.params;
    const targetId = Number(id);
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const db = getPool();

    const target = await getUserById(targetId);
    if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    if (target.role_code === 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    if (sessionId) {
      await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL', [Number(sessionId), targetId]);
    } else {
      await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [targetId]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}