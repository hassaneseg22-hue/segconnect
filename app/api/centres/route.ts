import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUTS = ['arret', 'perturbe', 'en_cours', 'resolu'];
const GRAVITES = ['critique', 'elevee', 'moyenne', 'faible'];
const CATEGORIES = [
  'carburant', 'produits_chimiques', 'fuite', 'panne_equipement',
  'electricite_edg', 'vandalisme', 'travaux', 'consommables',
];
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

type Supply = { exercise: number; month: number; quantity: number; product: string };

/** Dernière livraison de gasoil par centre (table seg_technique_supply_monthly). */
async function lastFuelSupplies(): Promise<{ map: Record<string, Supply>; latest: string | null }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('seg_technique_supply_monthly')
      .select('exercise,month,center_name,product_name,row_type,quantity')
      .gte('exercise', new Date().getFullYear() - 2)
      .order('exercise', { ascending: false })
      .order('month', { ascending: false })
      .limit(5000);
    if (error) throw error;
    const map: Record<string, Supply> = {};
    let latest: string | null = null;
    for (const r of (data ?? []) as any[]) {
      if (r.row_type === 'AGGREGATE') continue;
      const q = Number(r.quantity);
      if (!(q > 0)) continue;
      if (!latest) latest = `${r.exercise}-${String(r.month).padStart(2, '0')}`;
      if (!/gasoil|gazole|carburant|diesel/.test(norm(String(r.product_name ?? '')))) continue;
      const key = norm(String(r.center_name ?? ''));
      if (!key || map[key]) continue;
      map[key] = { exercise: r.exercise, month: r.month, quantity: q, product: String(r.product_name) };
    }
    return { map, latest };
  } catch (e) {
    console.error('[api/centres] livraisons carburant:', e instanceof Error ? e.message : e);
    return { map: {}, latest: null };
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'centres.view');

    const url = new URL(request.url);
    let rapport = url.searchParams.get('rapport');
    if (!rapport) {
      const { data: last, error: e1 } = await supabaseAdmin
        .from('centres_problemes')
        .select('rapport_date')
        .order('rapport_date', { ascending: false })
        .limit(1);
      if (e1) throw e1;
      rapport = last?.[0]?.rapport_date ?? null;
    }
    if (!rapport) {
      return NextResponse.json({ ok: true, rapport_date: null, rows: [], summary: null }, { headers: NO_STORE });
    }

    const { data, error } = await supabaseAdmin
      .from('centres_problemes')
      .select('*')
      .eq('rapport_date', rapport)
      .order('numero_ordre', { ascending: true });
    if (error) throw error;

    const supplies = await lastFuelSupplies();
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      dernier_gasoil: supplies.map[norm(String(r.centre))] ?? null,
    }));

    const open = rows.filter((r: any) => r.statut !== 'resolu');
    const has = (c: string) => open.filter((r: any) => (r.categories ?? []).includes(c)).length;
    const summary = {
      total: rows.length,
      arret: rows.filter((r: any) => r.statut === 'arret').length,
      perturbe: rows.filter((r: any) => r.statut === 'perturbe').length,
      resolu: rows.filter((r: any) => r.statut === 'resolu').length,
      critiques: open.filter((r: any) => r.gravite === 'critique').length,
      carburant: has('carburant'),
      produits_chimiques: has('produits_chimiques'),
      fuite: has('fuite'),
      electricite_edg: has('electricite_edg'),
      derniere_livraison_donnees: supplies.latest,
    };

    return NextResponse.json({ ok: true, rapport_date: rapport, rows, summary }, { headers: NO_STORE });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status !== 500) return response;
    console.error('[api/centres:GET]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Impossible de charger les centres.' }, { status: 500 });
  }
}

/** Mise à jour du statut / de la gravité / de l'observation (déclenche les notifications côté base). */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'centres.update');

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'Identifiant invalide.' }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (body.statut !== undefined) {
      if (!STATUTS.includes(String(body.statut))) {
        return NextResponse.json({ ok: false, error: 'Statut invalide.' }, { status: 400 });
      }
      patch.statut = body.statut;
    }
    if (body.gravite !== undefined) {
      if (!GRAVITES.includes(String(body.gravite))) {
        return NextResponse.json({ ok: false, error: 'Gravité invalide.' }, { status: 400 });
      }
      patch.gravite = body.gravite;
    }
    if (typeof body.observation === 'string') patch.observation = body.observation.trim().slice(0, 500);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'Rien à modifier.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('centres_problemes').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, row: data }, { headers: NO_STORE });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status !== 500) return response;
    console.error('[api/centres:PATCH]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Mise à jour impossible.' }, { status: 500 });
  }
}

/** Ajout / remplacement d'un problème pour un centre à une date de rapport. */
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'centres.update');

    const b = (await request.json().catch(() => ({}))) as Record<string, any>;
    const centre = String(b.centre ?? '').trim();
    const region = String(b.region ?? '').trim();
    const probleme = String(b.probleme ?? '').trim();
    if (!centre || !region || !probleme) {
      return NextResponse.json({ ok: false, error: 'centre, region et probleme sont requis.' }, { status: 400 });
    }
    const categories = Array.isArray(b.categories) ? b.categories.map(String) : [];
    if (categories.some((c) => !CATEGORIES.includes(c))) {
      return NextResponse.json({ ok: false, error: 'Catégorie invalide.' }, { status: 400 });
    }
    const statut = b.statut ?? 'perturbe';
    const gravite = b.gravite ?? 'elevee';
    if (!STATUTS.includes(statut) || !GRAVITES.includes(gravite)) {
      return NextResponse.json({ ok: false, error: 'Statut ou gravité invalide.' }, { status: 400 });
    }
    const date = /^\d{4}-\d{2}-\d{2}$/;
    const rapport_date = date.test(String(b.rapport_date)) ? b.rapport_date : new Date().toISOString().slice(0, 10);
    const date_debut = date.test(String(b.date_debut)) ? b.date_debut : null;

    const { data, error } = await supabaseAdmin
      .from('centres_problemes')
      .upsert({
        rapport_date, centre, region, probleme, categories, statut, gravite, date_debut,
        date_debut_precision: date_debut ? 'jour' : 'inconnue',
        solution: b.solution ? String(b.solution).slice(0, 300) : null,
        responsable: b.responsable ? String(b.responsable).slice(0, 120) : null,
        impacts: b.impacts ? String(b.impacts).slice(0, 300) : null,
        observation: b.observation ? String(b.observation).slice(0, 500) : null,
      }, { onConflict: 'centre,rapport_date' })
      .select('*').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, row: data }, { status: 201, headers: NO_STORE });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status !== 500) return response;
    console.error('[api/centres:POST]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Enregistrement impossible.' }, { status: 500 });
  }
}
