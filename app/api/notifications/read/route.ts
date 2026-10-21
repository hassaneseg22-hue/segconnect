import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { markRead, markAllRead } from '@/lib/notifications-db';
import { notificationAccess } from '@/lib/notifications-access';

// Correctif P0 : marquer comme lu exige une session et l'accès aux notifications.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const access = await notificationAccess(user);
    if (!access.canRead) {
      return NextResponse.json({ ok: false, error: 'Accès refusé.' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { all?: unknown; id?: unknown };
    if (body.all === true) {
      await markAllRead();
    } else if (body.id != null && Number.isFinite(Number(body.id))) {
      await markRead(Number(body.id));
    } else {
      return NextResponse.json({ ok: false, error: 'body { id } ou { all:true } requis' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const authResponse = authErrorResponse(e);
    if (authResponse.status !== 500) return authResponse;
    console.error('[notifications:read]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Erreur.' }, { status: 500 });
  }
}
