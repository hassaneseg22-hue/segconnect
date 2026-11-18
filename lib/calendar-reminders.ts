import { supabaseAdmin } from '@/lib/supabase/admin';

/** Transforme en notification (cloche + notification navigateur) les rappels d'agenda arrivés à échéance. */
export async function dispatchCalendarReminders() {
  const now = Date.now();
  const res = { due: 0, created: 0 };
  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .select('id,title,location,starts_at,all_day,reminder_minutes')
    .not('reminder_minutes', 'is', null)
    .is('reminded_at', null)
    .gte('starts_at', new Date(now - 3600_000).toISOString())
    .lte('starts_at', new Date(now + 8 * 86400_000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(200);
  if (error) throw error;

  type Row = { id: number; title: string; location: string | null; starts_at: string; all_day: boolean; reminder_minutes: number | null };
  for (const e of (data ?? []) as Row[]) {
    const start = new Date(e.starts_at).getTime();
    if (start - Number(e.reminder_minutes) * 60_000 > now) continue; // pas encore l'heure du rappel
    res.due++;
    const key = `agenda:${e.id}:${e.starts_at}`;
    const { data: exists } = await supabaseAdmin
      .from('notifications').select('id').eq('metadata->>dedup_key', key).limit(1);
    if (!exists?.length) {
      const when = new Date(e.starts_at).toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long',
        ...(e.all_day ? {} : { hour: '2-digit', minute: '2-digit' }),
        timeZone: 'Africa/Conakry',
      });
      const { error: e2 } = await supabaseAdmin.from('notifications').insert({
        type: 'info', category: 'AGENDA', title: `Rappel : ${e.title}`,
        message: `${when}${e.location ? ` · ${e.location}` : ''}`,
        source: 'Calendrier du DG', severity_score: 50, target_url: '/',
        metadata: { dedup_key: key, event_id: e.id }, is_read: false, read_at: null,
      });
      if (e2) throw e2;
      res.created++;
    }
    await supabaseAdmin.from('calendar_events').update({ reminded_at: new Date().toISOString() }).eq('id', e.id);
  }
  return res;
}
