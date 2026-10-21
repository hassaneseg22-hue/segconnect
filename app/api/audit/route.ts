import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { listAuditLogs } from '@/lib/auth/audit';

// GET /api/audit?page=&limit=&search=&action=&userId=&from=&to=
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'audit.view');
    const url = new URL(req.url);
    const data = await listAuditLogs({
      page: Number(url.searchParams.get('page') || 1),
      limit: Number(url.searchParams.get('limit') || 25),
      search: url.searchParams.get('search') || undefined,
      action: url.searchParams.get('action') || undefined,
      userId: url.searchParams.get('userId') || undefined,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return authErrorResponse(err);
  }
}