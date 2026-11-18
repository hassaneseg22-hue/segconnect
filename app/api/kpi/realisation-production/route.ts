import { NextResponse } from 'next/server';
import { utilisateurAutorise } from '@/lib/journal-assistant';

// Taux de réalisation de la production (source DPR, table seg_production_realisation).
export const dynamic = 'force-dynamic';

export async function GET() {
  const acces = await utilisateurAutorise('production.view');
  if (!acces.ok) return NextResponse.json({ ok: false, error: acces.error }, { status: acces.status });
  const { db } = acces;
  try {
    const { data: last, error: e1 } = await db.from('seg_production_realisation')
      .select('periode_fin').order('periode_fin', { ascending: false }).limit(1);
    if (e1) throw e1;
    const fin = last?.[0]?.periode_fin;
    if (!fin) return NextResponse.json({ ok: true, data: null });
    const { data: sites, error: e2 } = await db.from('seg_production_realisation')
      .select('zone, numero, site, cap_px_m3h, prod_m3h, conso_horaire_lh, capacite_m3j, volume_produit_m3, volume_moyen_m3j, ratio_capacite, taux_annuel, prevision_annuelle_m3, observation, anomalie_source, periode_debut, periode_fin, nb_jours, date_document, source_fichier')
      .eq('periode_fin', fin).order('zone').order('numero');
    if (e2) throw e2;
    const { data: synthese, error: e3 } = await db.from('v_seg_production_realisation_synthese').select('*').eq('periode_fin', fin);
    if (e3) throw e3;
    return NextResponse.json({ ok: true, data: { sites: sites ?? [], synthese: synthese ?? [] } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message || 'Erreur production';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
