import { NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

const PERIODS = [1, 3, 5, 7, 9, 11];

export async function GET(req: Request) {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const year = Number(url.searchParams.get('year') || 2026);
    const agencyIdParam = url.searchParams.get('agencyId');
    const periodParam = url.searchParams.get('period');
    const period = periodParam && periodParam !== 'all' ? Number(periodParam) : null;

    if (!Number.isFinite(year) || (period !== null && !PERIODS.includes(period))) {
      return NextResponse.json({ ok: false, error: 'Paramètres invalides.' }, { status: 400 });
    }

    const { data: agencies, error: agenciesError } = await supabaseAdmin
      .from('agencies').select('id, code, name, active').eq('active', true).order('name');
    if (agenciesError) throw agenciesError;

    let query = supabaseAdmin.from('seg_impayes_zone')
      .select('agency_id, agent_zone, period_month, emissions, impayes')
      .eq('exercise', year);

    if (agencyIdParam && agencyIdParam !== 'all') query = query.eq('agency_id', Number(agencyIdParam));
    if (period !== null) query = query.eq('period_month', period);

    const { data: rows, error } = await query;
    if (error) throw error;

    const map = new Map<number, any>();
    for (const a of agencies ?? []) {
      map.set(Number(a.id), { id: Number(a.id), code: String(a.code ?? ''), name: String(a.name ?? ''), emissions: 0, impayes: 0, rows: 0, agents: new Set<string>() });
    }
    for (const r of rows ?? []) {
      const a = map.get(Number(r.agency_id));
      if (!a) continue;
      a.emissions += Number(r.emissions) || 0;
      a.impayes += Number(r.impayes) || 0;
      a.rows += 1;
      if (String(r.agent_zone ?? '').trim()) a.agents.add(String(r.agent_zone).trim());
    }

    const result = Array.from(map.values()).map(a => ({
      id: a.id, code: a.code, name: a.name, emissions: a.emissions, impayes: a.impayes,
      rate: a.emissions > 0 ? a.impayes / a.emissions : 0, rows: a.rows, agents: a.agents.size,
    })).sort((a, b) => b.impayes - a.impayes);

    const emissions = result.reduce((s, a) => s + a.emissions, 0);
    const impayes = result.reduce((s, a) => s + a.impayes, 0);
    return NextResponse.json({ ok: true, data: {
      year, period, agencies: result,
      totals: { emissions, impayes, rate: emissions ? impayes / emissions : 0, agencies: result.length, rows: result.reduce((s,a) => s+a.rows,0) }
    }});
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    console.error('[api/kpi/impayes-agences]', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Impossible de charger les impayés.' }, { status: 503 });
  }
}
