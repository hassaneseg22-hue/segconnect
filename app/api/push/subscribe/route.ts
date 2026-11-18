import { NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { notificationAccess } from '@/lib/notifications-access';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { vapidPublicKey, sendTestPush } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function fail(e: unknown, tag: string) {
  const r = authErrorResponse(e);
  if (r.status !== 500) return r;
  console.error(`[api/push/subscribe:${tag}]`, e instanceof Error ? e.message : e);
  return NextResponse.json({ ok: false, error: 'Erreur notifications navigateur.' }, { status: 500 });
}

/** Clé publique VAPID pour l'abonnement du navigateur. */
export async function GET() {
  try {
    await requireAuth();
    const publicKey = vapidPublicKey();
    if (!publicKey) return NextResponse.json({ ok: false, error: 'Notifications navigateur non configurées.' }, { status: 503 });
    return NextResponse.json({ ok: true, publicKey }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'GET'); }
}

/** Enregistre l'abonnement de cet appareil (et envoie un test si demandé). */
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const access = await notificationAccess(user);
    if (!access.canRead) return NextResponse.json({ ok: false, error: 'Accès refusé.' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as any;
    const s = body?.subscription;
    const endpoint = String(s?.endpoint ?? '');
    const p256dh = String(s?.keys?.p256dh ?? '');
    const auth = String(s?.keys?.auth ?? '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: 'Abonnement invalide.' }, { status: 400 });
    }
    const u = user as any;
    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
      endpoint, p256dh, auth,
      user_id: u?.id != null ? String(u.id) : null,
      user_email: u?.email ?? null,
      role_code: u?.role_code ?? null,
      can_see_sensitive: access.canSeeSensitive,
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300),
      failures: 0,
    }, { onConflict: 'endpoint' });
    if (error) throw error;

    const test = body?.test === true ? await sendTestPush(endpoint) : null;
    return NextResponse.json({ ok: true, test }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'POST'); }
}

/** Désactive les notifications sur cet appareil. */
export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as any;
    const endpoint = String(body?.endpoint ?? '');
    if (!endpoint) return NextResponse.json({ ok: false, error: 'endpoint requis.' }, { status: 400 });
    const { error } = await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'DELETE'); }
}
