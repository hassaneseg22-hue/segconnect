import { NextResponse } from 'next/server';
import {
  requireAuth,
  requirePermission,
  authErrorResponse,
} from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/kpi/production-distribution?year=2026&monthTo=12[&month=3]
//
// - monthTo : la série mensuelle couvre Janvier → monthTo.
// - month   : (optionnel) les cumuls (KPI, sites, agences, villes) ne
//             portent que sur ce mois ; N-1 = le même mois de l'an passé.
//
// Production / distribution d'eau, réservoirs et réseau (source DCGT/DPR),
// lus dans les tables et vues créées par le script
// seg_injection_production_distribution_reseau.sql.
// Aucun total n'est figé : tout est recalculé à chaque requête.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Num = number | string | null | undefined;

function n(value: Num): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function nOrNull(value: Num): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

type BilanRow = {
  exercice: number;
  mois: number;
  volume_produit_m3: Num;
  volume_distribue_m3: Num;
};

type ConakryRow = {
  exercice: number;
  mois: number;
  volume_yessouloun_m3: Num;
  volume_forages_autres_m3: Num;
};

type NationalRow = {
  exercice: number;
  mois: number;
  total_villes_m3: Num;
  conakry_m3: Num;
  centres_m3: Num;
  total_declare_eau_traitee_m3: Num;
  total_declare_eau_brute_m3: Num;
  ecart_villes_vs_declare_m3: Num;
};

type SiteRow = { site_no: number | null; site_nom: string; mois: number; volume_m3: Num };
type AgencyRow = { agence_nom: string; agency_id: number | null; mois: number; volume_m3: Num };
type CityRow = { ville_nom: string; est_conakry: boolean; mois: number; volume_eau_traitee_m3: Num };

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'production.view');

    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year') || new Date().getFullYear());
    const monthTo = Number(url.searchParams.get('monthTo') || 12);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ ok: false, error: 'Année invalide.' }, { status: 400 });
    }

    if (!Number.isInteger(monthTo) || monthTo < 1 || monthTo > 12) {
      return NextResponse.json({ ok: false, error: 'Mois invalide.' }, { status: 400 });
    }

    const monthParam = url.searchParams.get('month');
    const month = monthParam ? Number(monthParam) : null;

    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      return NextResponse.json({ ok: false, error: 'Mois invalide.' }, { status: 400 });
    }

    // Requêtes de détail : un seul mois, ou Janvier → monthTo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodFilter = (q: any) =>
      month !== null ? q.eq('mois', month) : q.lte('mois', monthTo);

    const years = [year, year - 1];

    const [
      bilanRes,
      conakryRes,
      nationalRes,
      sitesRes,
      agenciesRes,
      citiesRes,
      reservoirsRes,
      reseauRes,
      yearsRes,
      refreshRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('v_seg_bilan_distribution_conakry')
        .select('exercice,mois,volume_produit_m3,volume_distribue_m3')
        .in('exercice', years)
        .lte('mois', monthTo)
        .order('mois', { ascending: true }),
      supabaseAdmin
        .from('v_seg_production_conakry_mensuelle')
        .select('exercice,mois,volume_yessouloun_m3,volume_forages_autres_m3')
        .eq('exercice', year)
        .lte('mois', monthTo),
      supabaseAdmin
        .from('v_seg_production_nationale_mensuelle')
        .select('exercice,mois,total_villes_m3,conakry_m3,centres_m3,total_declare_eau_traitee_m3,total_declare_eau_brute_m3,ecart_villes_vs_declare_m3')
        .in('exercice', years)
        .lte('mois', monthTo)
        .order('mois', { ascending: true }),
      periodFilter(
        supabaseAdmin
        .from('seg_production_sites_mensuelle')
        .select('site_no,site_nom,mois,volume_m3')
        .eq('exercice', year)
      ),
      periodFilter(
        supabaseAdmin
        .from('seg_distribution_agences_mensuelle')
        .select('agence_nom,agency_id,mois,volume_m3')
        .eq('exercice', year)
      ),
      periodFilter(
        supabaseAdmin
        .from('seg_production_villes_mensuelle')
        .select('ville_nom,est_conakry,mois,volume_eau_traitee_m3')
        .eq('exercice', year)
      ),
      supabaseAdmin
        .from('seg_reservoirs')
        .select('id,nom,code_ouvrage,localisation,capacite_m3,type_ouvrage,fonction,station_chloration,etat_structure,volume_moyen_journalier_m3,volume_reference_annee,annee_mise_en_service')
        .order('capacite_m3', { ascending: false }),
      supabaseAdmin
        .from('v_seg_reseau_par_zone')
        .select('zone_commerciale,agency_id,nb_zones_hydrauliques,lineaire_total_ml,lineaire_fonte_ml,lineaire_acier_ml,lineaire_pvc_ml,annee_pose_moyenne_ponderee')
        .order('lineaire_total_ml', { ascending: false }),
      supabaseAdmin
        .from('seg_production_totaux_mensuelle')
        .select('exercice'),
      supabaseAdmin
        .from('seg_data_refresh')
        .select('dataset,refreshed_at')
        .order('refreshed_at', { ascending: false })
        .limit(1),
    ]);

    const failed = [
      bilanRes, conakryRes, nationalRes, sitesRes, agenciesRes,
      citiesRes, reservoirsRes, reseauRes, yearsRes, refreshRes,
    ].find((result) => result.error);

    if (failed?.error) {
      console.error('[production-distribution]', failed.error.message);
      return NextResponse.json(
        { ok: false, error: 'Erreur de lecture des données de production et de distribution.' },
        { status: 500 }
      );
    }

    const bilan = (bilanRes.data ?? []) as BilanRow[];
    const conakry = (conakryRes.data ?? []) as ConakryRow[];
    const national = (nationalRes.data ?? []) as NationalRow[];
    const sites = (sitesRes.data ?? []) as SiteRow[];
    const agencyRows = (agenciesRes.data ?? []) as AgencyRow[];
    const cityRows = (citiesRes.data ?? []) as CityRow[];

    // ---- Série mensuelle (année courante) -------------------------------
    const monthly = Array.from({ length: monthTo }, (_, index) => index + 1)
      .map((mois) => {
        const b = bilan.find((row) => row.exercice === year && row.mois === mois);
        const c = conakry.find((row) => row.mois === mois);
        const nat = national.find((row) => row.exercice === year && row.mois === mois);
        const bPrev = bilan.find((row) => row.exercice === year - 1 && row.mois === mois);
        const natPrev = national.find((row) => row.exercice === year - 1 && row.mois === mois);

        const production = nOrNull(b?.volume_produit_m3);
        const distribution = nOrNull(b?.volume_distribue_m3);

        return {
          mois,
          production,
          distribution,
          ratio: production && distribution !== null ? distribution / production : null,
          productionN1: nOrNull(bPrev?.volume_produit_m3),
          yessouloun: nOrNull(c?.volume_yessouloun_m3),
          foragesAutres: nOrNull(c?.volume_forages_autres_m3),
          national: nOrNull(nat?.total_villes_m3),
          nationalN1: nOrNull(natPrev?.total_villes_m3),
          nationalConakry: nOrNull(nat?.conakry_m3),
          nationalCentres: nOrNull(nat?.centres_m3),
          declareEauTraitee: nOrNull(nat?.total_declare_eau_traitee_m3),
          declareEauBrute: nOrNull(nat?.total_declare_eau_brute_m3),
          ecart: nOrNull(nat?.ecart_villes_vs_declare_m3),
        };
      })
      .filter((row) => row.production !== null || row.national !== null || row.declareEauTraitee !== null);

    const monthsWithData = monthly.map((row) => row.mois);
    // Mois couverts par les cumuls : le mois choisi, ou tous les mois renseignés.
    const periodMonths = month !== null ? [month] : monthsWithData;
    const sum = (rows: BilanRow[] | NationalRow[], key: string, y: number) =>
      (rows as Array<Record<string, Num> & { exercice: number; mois: number }>)
        .filter((row) => row.exercice === y && periodMonths.includes(row.mois))
        .reduce((acc, row) => acc + n(row[key]), 0);

    const productionConakry = sum(bilan, 'volume_produit_m3', year);
    const distributionConakry = sum(bilan, 'volume_distribue_m3', year);
    const productionNationale = sum(national, 'total_villes_m3', year);

    // ---- Sites, agences, villes : cumuls de la période ----------------
    const group = <T,>(rows: T[], key: (row: T) => string, value: (row: T) => number) => {
      const map = new Map<string, { total: number; sample: T }>();
      for (const row of rows) {
        const k = key(row);
        const current = map.get(k) ?? { total: 0, sample: row };
        current.total += value(row);
        map.set(k, current);
      }
      return Array.from(map.values());
    };

    const siteTotals = group(sites, (r) => r.site_nom, (r) => n(r.volume_m3))
      .map(({ total, sample }) => ({ site_no: sample.site_no, site_nom: sample.site_nom, volume: total }))
      .sort((a, b) => b.volume - a.volume);
    const sitesTotal = siteTotals.reduce((acc, s) => acc + s.volume, 0);

    const agencyTotals = group(agencyRows, (r) => r.agence_nom, (r) => n(r.volume_m3))
      .map(({ total, sample }) => ({ agence_nom: sample.agence_nom, agency_id: sample.agency_id, volume: total }))
      .sort((a, b) => b.volume - a.volume);
    const agenciesTotal = agencyTotals.reduce((acc, a) => acc + a.volume, 0);

    const cityTotals = group(cityRows, (r) => r.ville_nom, (r) => n(r.volume_eau_traitee_m3))
      .map(({ total, sample }) => ({ ville_nom: sample.ville_nom, est_conakry: sample.est_conakry, volume: total }))
      .sort((a, b) => b.volume - a.volume);

    const reservoirs = (reservoirsRes.data ?? []).map((r) => ({
      ...r,
      capacite_m3: nOrNull(r.capacite_m3 as Num),
      volume_moyen_journalier_m3: nOrNull(r.volume_moyen_journalier_m3 as Num),
    }));
    const reseau = (reseauRes.data ?? []).map((z) => ({
      ...z,
      lineaire_total_ml: n(z.lineaire_total_ml as Num),
      lineaire_fonte_ml: n(z.lineaire_fonte_ml as Num),
      lineaire_acier_ml: n(z.lineaire_acier_ml as Num),
      lineaire_pvc_ml: n(z.lineaire_pvc_ml as Num),
      annee_pose_moyenne_ponderee: nOrNull(z.annee_pose_moyenne_ponderee as Num),
    }));

    const availableYears = Array.from(
      new Set((yearsRes.data ?? []).map((row) => Number(row.exercice)))
    ).filter(Number.isFinite).sort((a, b) => b - a);

    const anomalies = monthly
      .filter((row) => row.ecart !== null && row.ecart !== 0)
      .map((row) => ({ mois: row.mois, ecart: row.ecart }));

    return NextResponse.json(
      {
        ok: true,
        filters: { year, monthTo, month },
        data: {
          kpis: {
            productionConakry,
            distributionConakry,
            ratioDistributionProduction: productionConakry > 0 ? distributionConakry / productionConakry : null,
            productionConakryN1: sum(bilan, 'volume_produit_m3', year - 1),
            distributionConakryN1: sum(bilan, 'volume_distribue_m3', year - 1),
            productionNationale,
            productionNationaleN1: sum(national, 'total_villes_m3', year - 1),
            eauBruteDeclaree: monthly
              .filter((row) => periodMonths.includes(row.mois))
              .reduce((acc, row) => acc + (row.declareEauBrute ?? 0), 0),
            conakryNationale: sum(national, 'conakry_m3', year),
            centresNationale: sum(national, 'centres_m3', year),
            sitesActifs: siteTotals.filter((s) => s.volume > 0).length,
            sitesTotal: siteTotals.length,
            reservoirsCount: reservoirs.length,
            reservoirsCapacity: reservoirs.reduce((acc, r) => acc + (r.capacite_m3 ?? 0), 0),
            reseauLineaire: reseau.reduce((acc, z) => acc + z.lineaire_total_ml, 0),
            reseauZones: reseau.reduce((acc, z) => acc + n(z.nb_zones_hydrauliques as Num), 0),
            monthsWithData: monthsWithData.length,
            periodMonths,
            lastMonth: monthsWithData.length ? Math.max(...monthsWithData) : null,
          },
          monthly,
          sites: siteTotals.map((s) => ({ ...s, part: sitesTotal > 0 ? s.volume / sitesTotal : 0 })),
          agencies: agencyTotals.map((a) => ({ ...a, part: agenciesTotal > 0 ? a.volume / agenciesTotal : 0 })),
          cities: cityTotals,
          reservoirs,
          reseau,
          anomalies,
          availableYears,
          lastRefresh: refreshRes.data?.[0]?.refreshed_at ?? null,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;

    console.error(
      '[production-distribution]',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );

    return NextResponse.json(
      { ok: false, error: 'Erreur interne lors du chargement de la production.' },
      { status: 500 }
    );
  }
}
