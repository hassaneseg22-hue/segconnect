import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runAlertEngine } from '@/lib/alert-engine';
import { dispatchPendingPushes } from '@/lib/push';
import { dispatchCalendarReminders } from '@/lib/calendar-reminders';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Appelée par le crontab du serveur avec l'en-tête x-cron-secret. */
function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET || '';
  const got = req.headers.get('x-cron-secret') || '';
  if (expected.length < 32 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Non autorisé.' }, { status: 401 });

  const url = new URL(req.url);
  const out: Record<string, unknown> = { ok: true, at: new Date().toISOString() };

  if (url.searchParams.get('engine') === '1') {
    try {
      out.engine = await runAlertEngine();
    } catch (e) {
      out.engine_error = e instanceof Error ? e.message : String(e);
      console.error('[cron:engine]', out.engine_error);
    }
  }
  try {
    out.reminders = await dispatchCalendarReminders();
  } catch (e) {
    out.reminders_error = e instanceof Error ? e.message : String(e);
    console.error('[cron:reminders]', out.reminders_error);
  }
  try {
    out.push = await dispatchPendingPushes();
  } catch (e) {
    out.push_error = e instanceof Error ? e.message : String(e);
    console.error('[cron:push]', out.push_error);
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
