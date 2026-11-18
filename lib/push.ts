import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Sub = { id: number; endpoint: string; p256dh: string; auth: string; can_see_sensitive: boolean; failures: number; role_code?: string | null };
type Notif = { id: number; type: string; category: string; title: string; message: string; target_url: string | null };
type Result = 'ok' | 'gone' | 'error';

const PUSH_TYPES = new Set(['critical', 'warning']);
const SENSITIVE = new Set(['SECURITY', 'USERS']);
const MAX_INDIVIDUAL = 3; // au-delà : une seule notification de synthèse
const RANK: Record<Result, number> = { ok: 0, error: 1, gone: 2 };

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://connect.seg.gn', pub, priv);
  configured = true;
  return true;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function sendTo(sub: Pick<Sub, 'endpoint' | 'p256dh' | 'auth'>, payload: Record<string, unknown>, urgent: boolean): Promise<Result> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 43200, urgency: urgent ? 'high' : 'normal' }
    );
    return 'ok';
  } catch (e: any) {
    const code = Number(e?.statusCode);
    if (code === 404 || code === 410) return 'gone'; // abonnement expiré / révoqué
    console.error('[push] échec envoi', code || '', e?.body || e?.message);
    return 'error';
  }
}

async function recordResults(results: Map<number, Result>, subs: Sub[]) {
  const ids = (r: Result) => [...results].filter(([, v]) => v === r).map(([id]) => id);
  const gone = ids('gone');
  const ok = ids('ok');
  if (gone.length) await supabaseAdmin.from('push_subscriptions').delete().in('id', gone);
  if (ok.length) {
    await supabaseAdmin.from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString(), failures: 0 }).in('id', ok);
  }
  for (const s of subs) {
    if (results.get(s.id) !== 'error') continue;
    const failures = (s.failures ?? 0) + 1;
    if (failures >= 10) await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id);
    else await supabaseAdmin.from('push_subscriptions').update({ failures }).eq('id', s.id);
  }
}

/** Envoie en Web Push les notifications critiques/attention pas encore envoyées, puis les marque pushed_at. */
export async function dispatchPendingPushes() {
  if (!configure()) throw new Error('Clés VAPID absentes du .env');

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id,type,category,title,message,target_url')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;

  const pending = (data ?? []) as Notif[];
  const res = { pending: pending.length, pushable: 0, subscriptions: 0, sent: 0, gone: 0, errors: 0 };
  if (!pending.length) return res;

  const pushable = pending.filter((n) => PUSH_TYPES.has(n.type) || String(n.category).toUpperCase() === 'AGENDA');
  res.pushable = pushable.length;

  if (pushable.length) {
    const { data: subsData, error: e2 } = await supabaseAdmin
      .from('push_subscriptions').select('id,endpoint,p256dh,auth,can_see_sensitive,failures,role_code');
    if (e2) throw e2;
    const subs = (subsData ?? []) as Sub[];
    res.subscriptions = subs.length;
    const results = new Map<number, Result>();

    await Promise.all(subs.map(async (sub) => {
      const mine = pushable.filter((n) => String(n.category).toUpperCase() === 'AGENDA' ? sub.role_code === 'SUPER_ADMIN' : (sub.can_see_sensitive || !SENSITIVE.has(String(n.category).toUpperCase())));
      if (!mine.length) return;
      const crit = mine.filter((n) => n.type === 'critical');
      const payloads = mine.length <= MAX_INDIVIDUAL
        ? mine.map((n) => ({
            title: n.title, body: cut(n.message, 180), url: n.target_url || '/notifications',
            tag: `seg-${n.id}`, type: n.type,
          }))
        : [{
            title: `SEG Connect : ${mine.length} nouvelles alertes${crit.length ? ` dont ${crit.length} critiques` : ''}`,
            body: cut([...crit, ...mine.filter((n) => n.type !== 'critical')].slice(0, 4).map((n) => n.title).join(' · '), 220),
            url: '/notifications', tag: 'seg-resume', type: crit.length ? 'critical' : 'warning',
          }];
      let worst: Result = 'ok';
      for (const p of payloads) {
        const r = await sendTo(sub, p, p.type === 'critical');
        if (r === 'ok') res.sent++;
        if (RANK[r] > RANK[worst]) worst = r;
        if (r === 'gone') break;
      }
      results.set(sub.id, worst);
    }));

    res.gone = [...results.values()].filter((r) => r === 'gone').length;
    res.errors = [...results.values()].filter((r) => r === 'error').length;
    await recordResults(results, subs);
  }

  const { error: e3 } = await supabaseAdmin
    .from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', pending.map((n) => n.id));
  if (e3) throw e3;
  return res;
}

/** Notification de test envoyée juste après l'activation sur un appareil. */
export async function sendTestPush(endpoint: string): Promise<Result | 'not_configured' | 'not_found'> {
  if (!configure()) return 'not_configured';
  const { data } = await supabaseAdmin
    .from('push_subscriptions').select('endpoint,p256dh,auth').eq('endpoint', endpoint).maybeSingle();
  if (!data) return 'not_found';
  return sendTo(data as Sub, {
    title: 'SEG Connect', body: 'Les notifications sont activées sur cet appareil.',
    url: '/notifications', tag: 'seg-test', type: 'info',
  }, false);
}
