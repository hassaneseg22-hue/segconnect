import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = 'id,title,notes,location,starts_at,ends_at,all_day,reminder_minutes,created_at,updated_at';

type Auto = { id: string; date: string; kind: 'centre' | 'rapport' | 'fin_mois'; title: string; detail?: string; href?: string };

function fail(e: unknown, tag: string) {
  const r = authErrorResponse(e);
  if (r.status !== 500) return r;
  const code = (e as { code?: string } | null)?.code;
  if (code === '23514') return NextResponse.json({ ok: false, error: 'Dates incohérentes (la fin précède le début).' }, { status: 400 });
  console.error(`[api/calendrier:${tag}]`, e instanceof Error ? e.message : e);
  return NextResponse.json({ ok: false, error: 'Erreur du calendrier.' }, { status: 500 });
}

const parseDate = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  const y = d.getUTCFullYear();
  return Number.isNaN(d.getTime()) || y < 2000 || y > 2100 ? null : d;
};

/** Valide les champs d'un événement (partial = PATCH). */
function readFields(b: Record<string, any>, partial: boolean): { error?: string; values?: Record<string, unknown> } {
  const v: Record<string, unknown> = {};
  if (!partial || b.title !== undefined) {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (title.length < 1 || title.length > 200) return { error: 'Titre obligatoire (200 caractères maximum).' };
    v.title = title;
  }
  if (b.notes !== undefined) {
    if (b.notes !== null && (typeof b.notes !== 'string' || b.notes.length > 2000)) return { error: 'Notes trop longues (2000 caractères maximum).' };
    v.notes = b.notes ? String(b.notes).trim() || null : null;
  }
  if (b.location !== undefined) {
    if (b.location !== null && (typeof b.location !== 'string' || b.location.length > 200)) return { error: 'Lieu trop long (200 caractères maximum).' };
    v.location = b.location ? String(b.location).trim() || null : null;
  }
  if (!partial || b.starts_at !== undefined) {
    const d = parseDate(b.starts_at);
    if (!d) return { error: 'Date de début invalide.' };
    v.starts_at = d.toISOString();
  }
  if (b.ends_at !== undefined) {
    if (b.ends_at === null) v.ends_at = null;
    else {
      const d = parseDate(b.ends_at);
      if (!d) return { error: 'Date de fin invalide.' };
      v.ends_at = d.toISOString();
    }
  }
  if (b.all_day !== undefined) v.all_day = b.all_day === true;
  if (b.reminder_minutes !== undefined) {
    if (b.reminder_minutes === null) v.reminder_minutes = null;
    else {
      const m = Number(b.reminder_minutes);
      if (!Number.isInteger(m) || m < 0 || m > 10080) return { error: 'Délai de rappel invalide.' };
      v.reminder_minutes = m;
    }
  }
  if (typeof v.starts_at === 'string' && typeof v.ends_at === 'string' && v.ends_at < v.starts_at) {
    return { error: 'La fin précède le début.' };
  }
  return { values: v };
}

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (to exclu) : événements du DG + échéances automatiques. */
export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'calendrier.view');

    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const span = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || !(span >= 1 && span <= 120)) {
      return NextResponse.json({ ok: false, error: 'Période invalide.' }, { status: 400 });
    }

    const { data: events, error } = await supabaseAdmin
      .from('calendar_events')
      .select(COLUMNS)
      .eq('owner_id', String((user as { id: string }).id))
      .or(`and(starts_at.gte.${from},starts_at.lt.${to}),and(starts_at.lt.${from},ends_at.gte.${from})`)
      .order('starts_at', { ascending: true })
      .limit(500);
    if (error) throw error;

    const auto: Auto[] = [];

    // Échéances issues du rapport des centres de l'intérieur
    try {
      const { data: pb } = await supabaseAdmin
        .from('centres_problemes')
        .select('id,centre,statut,probleme,date_debut,date_debut_precision,rapport_date')
        .neq('statut', 'resolu')
        .or(`and(date_debut.gte.${from},date_debut.lt.${to}),and(rapport_date.gte.${from},rapport_date.lt.${to})`);
      const rapports = new Map<string, number>();
      for (const r of (pb ?? []) as Array<Record<string, any>>) {
        if (r.date_debut && r.date_debut >= from && r.date_debut < to && r.date_debut_precision !== 'inconnue') {
          auto.push({
            id: `centre-${r.id}`, date: r.date_debut, kind: 'centre', href: '/centres',
            title: `${r.statut === 'arret' ? 'Arrêt de production' : 'Perturbation'} : ${r.centre}`,
            detail: `${r.probleme}${r.date_debut_precision === 'jour' ? '' : ' (date estimée)'}`,
          });
        }
        if (r.rapport_date >= from && r.rapport_date < to) rapports.set(r.rapport_date, (rapports.get(r.rapport_date) ?? 0) + 1);
      }
      rapports.forEach((n, date) => auto.push({
        id: `rapport-${date}`, date, kind: 'rapport', href: '/centres',
        title: 'Rapport DC : problèmes techniques des centres',
        detail: `${n} centre(s) avec un problème non résolu à cette date de rapport`,
      }));
    } catch (e) {
      console.error('[api/calendrier] échéances centres:', e instanceof Error ? e.message : e);
    }

    // Fin de mois : clôture des données
    for (let t = Date.parse(from); t < Date.parse(to); t += 86400000) {
      const d = new Date(t);
      if (new Date(t + 86400000).getUTCDate() === 1) {
        auto.push({ id: `fin-${d.toISOString().slice(0, 10)}`, date: d.toISOString().slice(0, 10), kind: 'fin_mois', title: 'Fin de mois : clôture et import des données' });
      }
    }

    return NextResponse.json({ ok: true, events: events ?? [], auto }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'GET'); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'calendrier.update');
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const { error: err, values } = readFields(body, false);
    if (err || !values) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('calendar_events')
      .insert({ ...values, owner_id: String((user as { id: string }).id) })
      .select(COLUMNS).single();
    if (error) throw error;
    return NextResponse.json({ ok: true, event: data }, { status: 201, headers: NO_STORE });
  } catch (e) { return fail(e, 'POST'); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'calendrier.update');
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: 'Identifiant invalide.' }, { status: 400 });
    const { error: err, values } = readFields(body, true);
    if (err || !values) return NextResponse.json({ ok: false, error: err }, { status: 400 });
    if (Object.keys(values).length === 0) return NextResponse.json({ ok: false, error: 'Rien à modifier.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('calendar_events').update(values)
      .eq('id', id).eq('owner_id', String((user as { id: string }).id))
      .select(COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: 'Événement introuvable.' }, { status: 404 });
    return NextResponse.json({ ok: true, event: data }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'PATCH'); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'calendrier.update');
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: 'Identifiant invalide.' }, { status: 400 });
    const { error } = await supabaseAdmin
      .from('calendar_events').delete().eq('id', id).eq('owner_id', String((user as { id: string }).id));
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'DELETE'); }
}
