import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { listPermissions } from '@/lib/users/roles';

// GET /api/permissions — catalogue des permissions
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'roles.view');
    const data = await listPermissions();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return authErrorResponse(err);
  }
}