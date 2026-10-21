import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { createAuditLog } from '@/lib/auth/audit';
import { getPool } from '@/lib/mysql';

// GET /api/sessions — toutes les sessions actives (vue DG)
export async function GET(req: NextRequest) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'audit.view');
    const db = getPool();
    const [rows] = await db.query<any[]>(
      `SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.created_at, s.expires_at, s.last_activity_at,
              u.display_name, u.first_name, u.last_name, u.email, r.code AS role_code
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.revoked_at IS NULL AND s.expires_at > NOW()
       ORDER BY s.last_activity_at DESC
       LIMIT 200`
    );
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// DELETE /api/sessions/[id] — révoquer explicitement une session (via ?sessionId=)
export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireAuth();
    await requirePermission(actor, 'users.disable');
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ ok: false, error: 'VALIDATION_ERROR' }, { status: 422 });
    const db = getPool();
    const [rows] = await db.query<any[]>(`SELECT user_id FROM user_sessions WHERE id = ?`, [Number(sessionId)]);
    if (!rows[0]) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ?', [Number(sessionId)]);
    await createAuditLog({
      userId: actor.id, action: 'SESSION_REVOKED', targetType: 'SESSION', targetId: sessionId,
      description: 'Révocation d’une session active', result: 'SUCCESS',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}