import { NextResponse } from 'next/server';
import {
  requireAuth,
  requirePermission,
  authErrorResponse,
} from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/reseau
//
// Réseau de distribution de Conakry : conduites par zone hydraulique
// (table seg_reseau_conduites) + bilan produit / distribué du Grand
// Conakry (vue v_seg_bilan_distribution_conakry) pour l'indicateur de pertes.
// Aucune valeur n'est figée : tout est relu en base à chaque requête.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Num = number | string | null | undefined;

function n(value: Num): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

export async function GET() {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'network.view');

    const [conduitesRes, bilanRes, refreshRes] = await Promise.all([
      supabaseAdmin
        .from('seg_reseau_conduites')
        .select('id,zone_commerciale,agency_id,zone_hydraulique,ligne_no,diametre_mm,nature,nature_source,longueur_ml,annee_pose')
        .order('zone_commerciale', { ascending: true })
        .order('zone_hydraulique', { ascending: true })
        .order('ligne_no', { ascending: true })
        .limit(5000),
      supabaseAdmin
        .from('v_seg_bilan_distribution_conakry')
        .select('exercice,mois,volume_produit_m3,volume_distribue_m3')
        .order('exercice', { ascending: true })
        .order('mois', { ascending: true }),
      supabaseAdmin
        .from('seg_data_refresh')
        .select('refreshed_at')
        .eq('dataset', 'seg_reseau_conduites')
        .limit(1),
    ]);

    const failed = [conduitesRes, bilanRes, refreshRes].find((r) => r.error);
    if (failed?.error) {
      console.error('[reseau]', failed.error.message);
      return NextResponse.json(
        { ok: false, error: 'Erreur de lecture des données du réseau.' },
        { status: 500 }
      );
    }

    const conduites = (conduitesRes.data ?? []).map((row) => ({
      id: Number(row.id),
      zone_commerciale: String(row.zone_commerciale),
      agency_id: row.agency_id === null ? null : Number(row.agency_id),
      zone_hydraulique: String(row.zone_hydraulique),
      ligne_no: Number(row.ligne_no),
      diametre_mm: Number(row.diametre_mm),
      nature: String(row.nature),
      nature_source: String(row.nature_source),
      longueur_ml: n(row.longueur_ml as Num),
      annee_pose: row.annee_pose === null ? null : Number(row.annee_pose),
    }));

    // Bilan annuel produit / distribué (Grand Conakry) par exercice.
    const byYear = new Map<number, { exercice: number; mois: number; produit: number; distribue: number }>();
    for (const row of bilanRes.data ?? []) {
      const exercice = Number(row.exercice);
      const current = byYear.get(exercice) ?? { exercice, mois: 0, produit: 0, distribue: 0 };
      if (row.volume_distribue_m3 !== null) {
        current.mois = Math.max(current.mois, Number(row.mois));
        current.produit += n(row.volume_produit_m3 as Num);
        current.distribue += n(row.volume_distribue_m3 as Num);
      }
      byYear.set(exercice, current);
    }

    const bilan = Array.from(byYear.values())
      .filter((b) => b.produit > 0)
      .sort((a, b) => a.exercice - b.exercice);

    return NextResponse.json(
      {
        ok: true,
        data: {
          conduites,
          bilan,
          lastRefresh: refreshRes.data?.[0]?.refreshed_at ?? null,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;

    console.error('[reseau]', error instanceof Error ? error.message : 'Erreur inconnue');
    return NextResponse.json(
      { ok: false, error: 'Erreur interne lors du chargement du réseau.' },
      { status: 500 }
    );
  }
}
