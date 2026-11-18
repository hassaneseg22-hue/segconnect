import { NextResponse } from 'next/server';
import { utilisateurAutorise } from '@/lib/journal-assistant';

// Journal du DG : problèmes en cours des centres + agenda du jour.
// Lecture seule. Accès réservé aux utilisateurs connectés (session Supabase).
export const dynamic = 'force-dynamic';

type Ligne = {
  id: number;
  numero_ordre: number | null;
  centre: string;
  region: string;
  probleme: string;
  categories: string[] | null;
  solution: string | null;
  responsable: string | null;
  impacts: string | null;
  observation: string | null;
  statut: 'arret' | 'perturbe' | 'en_cours' | 'resolu';
  gravite: 'critique' | 'elevee' | 'moyenne' | 'faible';
  date_debut: string | null;
  date_debut_precision: string | null;
  heures_production_jour: number | null;
  updated_at: string | null;
};

const ORDRE_STATUT: Record<string, number> = { arret: 0, perturbe: 1, en_cours: 2, resolu: 3 };
const ORDRE_GRAVITE: Record<string, number> = { critique: 0, elevee: 1, moyenne: 2, faible: 3 };

function joursDepuis(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(d)) return null;
  const today = new Date();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((t - d) / 86_400_000));
}

export async function GET() {
  const acces = await utilisateurAutorise('journal.view');
  if (!acces.ok) return NextResponse.json({ ok: false, error: acces.error }, { status: acces.status });
  const { db } = acces;
  const user = { id: acces.userId };

  try {
    // 2) Dernier rapport des centres
    const { data: last, error: e1 } = await db
      .from('centres_problemes')
      .select('rapport_date')
      .order('rapport_date', { ascending: false })
      .limit(1);
    if (e1) throw e1;
    const rapportDate: string | null = last?.[0]?.rapport_date ?? null;

    let problemes: (Ligne & { jours: number | null; production?: unknown })[] = [];
    if (rapportDate) {
      const { data, error } = await db
        .from('centres_problemes')
        .select('id, numero_ordre, centre, region, probleme, categories, solution, responsable, impacts, observation, statut, gravite, date_debut, date_debut_precision, heures_production_jour, updated_at')
        .eq('rapport_date', rapportDate)
        .neq('statut', 'resolu');
      if (error) throw error;
      problemes = ((data ?? []) as Ligne[])
        .map((p) => ({ ...p, categories: p.categories ?? [], jours: joursDepuis(p.date_debut) }))
        .sort((a, b) =>
          (ORDRE_STATUT[a.statut] ?? 9) - (ORDRE_STATUT[b.statut] ?? 9) ||
          (ORDRE_GRAVITE[a.gravite] ?? 9) - (ORDRE_GRAVITE[b.gravite] ?? 9) ||
          (b.jours ?? -1) - (a.jours ?? -1)
        );
    }

    // 2 bis) Réalisation de la production de chaque centre (si disponible)
    try {
      const { data: lp } = await db.from('seg_production_realisation').select('periode_fin').order('periode_fin', { ascending: false }).limit(1);
      const fin = lp?.[0]?.periode_fin;
      if (fin) {
        const { data: pr } = await db.from('seg_production_realisation')
          .select('site, volume_produit_m3, ratio_capacite, taux_annuel, capacite_m3j, periode_debut, periode_fin')
          .eq('periode_fin', fin);
        const cle = (x: string) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
        const parSite = new Map((pr ?? []).map((r) => [cle(r.site), r]));
        problemes = problemes.map((p) => ({ ...p, production: parSite.get(cle(p.centre)) ?? null }));
      }
    } catch { /* table absente */ }

    // 3) Agenda du jour (facultatif : ignoré si la table n'existe pas)
    let agenda: { id: number; title: string; location: string | null; starts_at: string; all_day: boolean }[] = [];
    try {
      const now = new Date();
      const debut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const fin = new Date(debut.getTime() + 86_400_000);
      const { data } = await db
        .from('calendar_events')
        .select('id, title, location, starts_at, all_day')
        .eq('owner_id', user.id)
        .gte('starts_at', debut.toISOString())
        .lt('starts_at', fin.toISOString())
        .order('starts_at', { ascending: true });
      agenda = data ?? [];
    } catch { /* agenda indisponible */ }

    // 4) Synthèse
    const has = (p: { categories: string[] | null }, c: string) => (p.categories ?? []).includes(c);
    const synthese = {
      total: problemes.length,
      arret: problemes.filter((p) => p.statut === 'arret').length,
      perturbe: problemes.filter((p) => p.statut === 'perturbe').length,
      critiques: problemes.filter((p) => p.gravite === 'critique').length,
      carburant: problemes.filter((p) => has(p, 'carburant')).length,
      produits_chimiques: problemes.filter((p) => has(p, 'produits_chimiques')).length,
      fuites: problemes.filter((p) => has(p, 'fuite')).length,
      edg: problemes.filter((p) => has(p, 'electricite_edg')).length,
      plus_long_jours: problemes.reduce<number | null>((m, p) => (p.jours != null && (m == null || p.jours > m) ? p.jours : m), null),
    };

    return NextResponse.json({
      ok: true,
      data: { rapport_date: rapportDate, generated_at: new Date().toISOString(), problemes, synthese, agenda },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message || 'Erreur journal';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
