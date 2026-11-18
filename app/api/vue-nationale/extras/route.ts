import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, authErrorResponse } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCounts } from '@/lib/notifications-db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET() {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'national.view');

    let canCentres = true;
    try { await requirePermission(user, 'centres.view'); } catch { canCentres = false; }
    if (!canCentres) {
      return NextResponse.json({ ok: true, data: { canCentres: false } }, { headers: NO_STORE });
    }

    const { data: last, error: e1 } = await supabaseAdmin
      .from('centres_problemes').select('rapport_date').order('rapport_date', { ascending: false }).limit(1);
    if (e1) throw e1;
    const rapport = last?.[0]?.rapport_date ?? null;
    if (!rapport) {
      return NextResponse.json({
        ok: true,
        data: { canCentres: true, rapport_date: null, centres: [], summary: { total: 0, arret: 0, perturbe: 0, plus_long_arret: null }, alerts: { critical: 0, unread: 0 } },
      }, { headers: NO_STORE });
    }

    const year = new Date().getFullYear();
    const [probs, fact, supply, counts] = await Promise.all([
      supabaseAdmin.from('centres_problemes')
        .select('id,centre,region,statut,gravite,probleme,categories,date_debut,date_debut_precision,numero_ordre')
        .eq('rapport_date', rapport).order('numero_ordre', { ascending: true }),
      fetchAll<any>((a, b) => supabaseAdmin.from('seg_facturation_centres_mensuelle')
        .select('agence_nom,mois,chiffre_affaires_ttc').eq('exercice', year).order('id').range(a, b)),
      fetchAll<any>((a, b) => supabaseAdmin.from('seg_technique_supply_monthly')
        .select('exercise,month,center_name,product_name,row_type,quantity')
        .gte('exercise', year - 2)
        .order('exercise', { ascending: false }).order('month', { ascending: false }).order('id').range(a, b)),
      getCounts().catch(() => ({ unread: 0, critical: 0 } as any)),
    ]);
    if (probs.error) throw probs.error;

    // Facturation de référence par centre : moyenne des mois facturés
    const caByCentre = new Map<string, Map<number, number>>();
    for (const r of fact) {
      const key = norm(String(r.agence_nom ?? ''));
      if (!key) continue;
      const m = caByCentre.get(key) ?? new Map<number, number>();
      m.set(Number(r.mois), (m.get(Number(r.mois)) ?? 0) + (Number(r.chiffre_affaires_ttc) || 0));
      caByCentre.set(key, m);
    }
    const baselineOf = (centre: string) => {
      const m = caByCentre.get(norm(centre));
      if (!m) return null;
      const vals = Array.from(m.values()).filter((v) => v > 0);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    // Dernière livraison de gasoil par centre (lignes triées de la plus récente à la plus ancienne)
    const lastFuel = new Map<string, { exercise: number; month: number; quantity: number }>();
    for (const r of supply) {
      if (r.row_type === 'AGGREGATE') continue;
      const q = Number(r.quantity);
      if (!(q > 0)) continue;
      if (!/gasoil|gazole|carburant|diesel/.test(norm(String(r.product_name ?? '')))) continue;
      const key = norm(String(r.center_name ?? ''));
      if (!key || lastFuel.has(key)) continue;
      lastFuel.set(key, { exercise: Number(r.exercise), month: Number(r.month), quantity: q });
    }

    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth() + 1;

    const open = (probs.data ?? []).filter((r: any) => r.statut !== 'resolu');
    const centres = open.map((r: any) => {
      const hasDate = r.date_debut && r.date_debut_precision !== 'inconnue';
      const jours = hasDate ? Math.max(0, Math.floor((Date.now() - new Date(r.date_debut).getTime()) / 86400000)) : null;
      const baseline = baselineOf(String(r.centre));
      const fuel = lastFuel.get(norm(String(r.centre))) ?? null;
      return {
        id: r.id,
        centre: r.centre,
        region: r.region,
        statut: r.statut,
        gravite: r.gravite,
        probleme: r.probleme,
        categories: r.categories ?? [],
        jours,
        jours_approx: !!hasDate && r.date_debut_precision !== 'jour',
        baseline_ca_mensuel: baseline,
        perte_estimee: r.statut === 'arret' && jours != null && baseline != null ? Math.round((baseline * jours) / 30.4375) : null,
        dernier_gasoil: fuel,
        mois_depuis: fuel ? nowIdx - (fuel.exercise * 12 + fuel.month) : null,
      };
    });

    const longest = centres
      .filter((c) => c.jours != null)
      .sort((a, b) => (b.jours as number) - (a.jours as number))[0];

    return NextResponse.json({
      ok: true,
      data: {
        canCentres: true,
        rapport_date: rapport,
        centres,
        summary: {
          total: (probs.data ?? []).length,
          arret: (probs.data ?? []).filter((r: any) => r.statut === 'arret').length,
          perturbe: (probs.data ?? []).filter((r: any) => r.statut === 'perturbe').length,
          plus_long_arret: longest ? { centre: longest.centre, jours: longest.jours, approx: longest.jours_approx } : null,
        },
        alerts: { critical: Number((counts as any).critical) || 0, unread: Number((counts as any).unread) || 0 },
      },
    }, { headers: NO_STORE });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status !== 500) return response;
    console.error('[api/vue-nationale/extras]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Chargement impossible.' }, { status: 500 });
  }
}
