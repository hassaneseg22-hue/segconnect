import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { listNotifications, getCounts } from '@/lib/notifications-db';
import { runAlertEngine } from '@/lib/alert-engine';
import { notificationAccess, sanitizeNotifications } from '@/lib/notifications-access';

// Correctif P0 : ces routes n'exigeaient aucune session. Elles sont désormais
// réservées aux utilisateurs connectés et autorisés (voir lib/notifications-access.ts).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const access = await notificationAccess(user);
    if (!access.canRead) {
      return NextResponse.json({ ok: false, error: 'Accès refusé.' }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const rows = await listNotifications({
      limit: Number(sp.get('limit') || 20),
      unreadOnly: sp.get('unread') === '1',
      type: sp.get('type') || undefined,
      category: sp.get('category') || undefined,
    });
    const data = sanitizeNotifications(rows, access.canSeeSensitive);
    const counts = await getCounts();
    return NextResponse.json({ ok: true, data, counts }, { headers: NO_STORE });
  } catch (e) {
    const authResponse = authErrorResponse(e);
    if (authResponse.status !== 500) return authResponse;
    console.error('[notifications]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Erreur notifications.' }, { status: 500 });
  }
}

// POST = exécuter le moteur d'alertes (recalcul dédupliqué) — notifications.view requis.
export async function POST() {
  try {
    const user = await requireAuth();
    const access = await notificationAccess(user);
    if (!access.canManage) {
      return NextResponse.json({ ok: false, error: 'Permission requise : notifications.view' }, { status: 403 });
    }
    const result = await runAlertEngine();
    const counts = await getCounts();
    return NextResponse.json({ ok: true, ...result, counts }, { headers: NO_STORE });
  } catch (e) {
    const authResponse = authErrorResponse(e);
    if (authResponse.status !== 500) return authResponse;
    console.error('[notifications:engine]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Erreur du moteur d'alertes." }, { status: 500 });
  }
}
