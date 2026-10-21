import { NextResponse } from 'next/server';
import {
  requireAuth,
  requirePermission,
  authErrorResponse,
} from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

/* =====================================================================
 * GET /api/kpi/tableau-technique?year=2026
 *
 * Tableau de bord technique du DG : bilan de l'eau, eau non facturée,
 * recouvrement, classement des agences et des centres, fraîcheur des
 * données et alertes. Tout est recalculé depuis la base à chaque appel.
 *
 * Règles de calcul (documentées aussi sur la page) :
 * - Les comparaisons volume produit / distribué / facturé ne portent que
 *   sur les mois présents dans LES TROIS sources (période commune).
 * - La facturation de Conakry est bimestrielle : les taux mensuels
 *   oscillent ; on les présente par cycle de deux mois.
 * - Aucun objectif n'est inventé : les seuils des feux sont indicatifs
 *   et affichés comme tels.
 * ===================================================================== */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Num = number | string | null | undefined;
const n = (v: Num) => {
  const r = Number(v ?? 0);
  return Number.isFinite(r) ? r : 0;
};

const PAGE = 1000;

// Lecture paginée (Supabase limite chaque réponse à 1 000 lignes).
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const normKey = (value: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/forages?/g, '')
    .replace(/[^a-z]/g, '');

// Variantes d'orthographe entre relevés techniques et facturation des centres.
const CENTER_ALIASES: Record<string, string> = {
  kkan: 'kankan',
  koudara: 'koundara',
  gueckedougou: 'guekedou',
  guekegou: 'guekedou',
  gueckedou: 'guekedou',
  telimele: 'telemele',
};
const centerKey = (name: string) => {
  const k = normKey(name);
  return CENTER_ALIASES[k] ?? k;
};

// Seuils INDICATIFS des feux (à remplacer par les objectifs officiels SEG).
const THRESHOLDS = {
  commercialLoss: { good: 0.2, warn: 0.35 }, // part de l'eau distribuée non facturée
  recovery: { good: 0.7, warn: 0.5 },        // réglé / (facturé + pénalités)
  centerNrw: { good: 0.25, warn: 0.4 },      // eau traitée non facturée (centres)
  staleDays: { warn: 60, bad: 120 },
};

type Light = 'green' | 'orange' | 'red' | 'grey';
const lightLow = (v: number | null, t: { good: number; warn: number }): Light =>
  v === null ? 'grey' : v <= t.good ? 'green' : v <= t.warn ? 'orange' : 'red';
const lightHigh = (v: number | null, t: { good: number; warn: number }): Light =>
  v === null ? 'grey' : v >= t.good ? 'green' : v >= t.warn ? 'orange' : 'red';

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    await requirePermission(user, 'dashboard.view');

    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year') || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ ok: false, error: 'Année invalide.' }, { status: 400 });
    }
    const prev = year - 1;
    const start = `${prev}-01-01`;
    const end = `${year}-12-31`;

    const [agencies, sites, distrib, factu, recouv, tech, centresFactu] = await Promise.all([
      fetchAll<{ id: number; name: string }>(() => supabaseAdmin.from('agencies').select('id,name').order('id')),
      fetchAll<{ exercice: number; mois: number; volume_m3: Num }>(() =>
        supabaseAdmin.from('seg_production_sites_mensuelle').select('exercice,mois,volume_m3').in('exercice', [prev, year]).order('id')),
      fetchAll<{ exercice: number; mois: number; agence_nom: string; agency_id: number | null; volume_m3: Num }>(() =>
        supabaseAdmin.from('seg_distribution_agences_mensuelle').select('exercice,mois,agence_nom,agency_id,volume_m3').in('exercice', [prev, year]).order('id')),
      fetchAll<{ period_month: string; agency_id: number; volume_facture_total: Num; amount_total: Num }>(() =>
        supabaseAdmin.from('facturation_monthly').select('period_month,agency_id,volume_facture_total,amount_total').gte('period_month', start).lte('period_month', end).order('id')),
      fetchAll<{ period_month: string; agency_id: number; amount_penalty: Num; amount_paid: Num; balance_due: Num }>(() =>
        supabaseAdmin.from('recouvrement_monthly').select('period_month,agency_id,amount_penalty,amount_paid,balance_due').gte('period_month', start).lte('period_month', end).order('id')),
      fetchAll<{ period_month: string; center_name: string; raw_water_m3: Num; treated_water_m3: Num; gasoil_consumption_l: Num }>(() =>
        supabaseAdmin.from('seg_technique_center_monthly').select('period_month,center_name,raw_water_m3,treated_water_m3,gasoil_consumption_l').gte('period_month', `${year}-01-01`).lte('period_month', end).order('id')),
      fetchAll<{ mois: number; agence_nom: string; categorie: string; volume_facture: Num; chiffre_affaires_ttc: Num }>(() =>
        supabaseAdmin.from('seg_facturation_centres_mensuelle').select('mois,agence_nom,categorie,volume_facture,chiffre_affaires_ttc').eq('exercice', year).order('id')),
    ]);

    const agencyName = new Map(agencies.map((a) => [Number(a.id), String(a.name)]));

    /* ---------------- 1. Séries mensuelles (Conakry) ---------------- */
    const vp = new Map<string, number>();
    for (const r of sites) vp.set(ym(r.exercice, r.mois), (vp.get(ym(r.exercice, r.mois)) ?? 0) + n(r.volume_m3));
    const vd = new Map<string, number>();
    for (const r of distrib) vd.set(ym(r.exercice, r.mois), (vd.get(ym(r.exercice, r.mois)) ?? 0) + n(r.volume_m3));
    const billedVol = new Map<string, number>();
    const billedAmt = new Map<string, number>();
    for (const r of factu) {
      const k = String(r.period_month).slice(0, 7);
      billedVol.set(k, (billedVol.get(k) ?? 0) + n(r.volume_facture_total));
      billedAmt.set(k, (billedAmt.get(k) ?? 0) + n(r.amount_total));
    }
    const recBilled = new Map<string, number>();
    const recPaid = new Map<string, number>();
    for (const r of recouv) {
      const k = String(r.period_month).slice(0, 7);
      recBilled.set(k, (recBilled.get(k) ?? 0) + n(r.amount_penalty));
      recPaid.set(k, (recPaid.get(k) ?? 0) + n(r.amount_paid));
    }

    // Période commune : mois de l'exercice présents dans production, distribution ET facturation.
    const commonMonths = Array.from({ length: 12 }, (_, i) => ym(year, i + 1)).filter(
      (k) => (vp.get(k) ?? 0) > 0 && (vd.get(k) ?? 0) > 0 && (billedVol.get(k) ?? 0) > 0
    );
    const prevOf = (k: string) => `${prev}${k.slice(4)}`;
    const commonPrev = commonMonths.map(prevOf).filter(
      (k) => (vp.get(k) ?? 0) > 0 && (vd.get(k) ?? 0) > 0 && (billedVol.get(k) ?? 0) > 0
    );
    const sumOver = (m: Map<string, number>, keys: string[]) => keys.reduce((a, k) => a + (m.get(k) ?? 0), 0);

    const balance = (keys: string[]) => {
      const produit = sumOver(vp, keys);
      const distribue = sumOver(vd, keys);
      const facture = sumOver(billedVol, keys);
      return {
        months: keys,
        produit,
        distribue,
        facture,
        enf: produit > 0 ? 1 - facture / produit : null,
        pertesReseau: produit > 0 ? (produit - distribue) / produit : null,
        pertesCommerciales: produit > 0 ? (distribue - facture) / produit : null,
      };
    };
    const waterBalance = balance(commonMonths);
    const waterBalanceN1 = commonPrev.length === commonMonths.length ? balance(commonPrev) : null;

    // Recouvrement : mois de l'exercice présents dans le recouvrement.
    const recMonths = Array.from({ length: 12 }, (_, i) => ym(year, i + 1)).filter((k) => (recBilled.get(k) ?? 0) > 0);
    const money = {
      months: recMonths,
      factureTtc: sumOver(billedAmt, recMonths),
      factureAvecPenalites: sumOver(recBilled, recMonths),
      encaisse: sumOver(recPaid, recMonths),
      recouvrement: sumOver(recBilled, recMonths) > 0 ? sumOver(recPaid, recMonths) / sumOver(recBilled, recMonths) : null,
    };

    // Cycles bimestriels (1-2, 3-4, …) sur la période commune.
    const cycles: Array<{ label: string; months: string[]; enf: number | null; enfN1: number | null; recouvrement: number | null }> = [];
    for (let c = 0; c < 6; c++) {
      const keys = [ym(year, 2 * c + 1), ym(year, 2 * c + 2)];
      if (!keys.every((k) => commonMonths.includes(k))) continue;
      const b = balance(keys);
      const keysPrev = keys.map(prevOf);
      const bPrev = keysPrev.every((k) => (vp.get(k) ?? 0) > 0 && (billedVol.get(k) ?? 0) > 0) ? balance(keysPrev) : null;
      const rb = sumOver(recBilled, keys);
      cycles.push({
        label: `${['Jan', 'Mar', 'Mai', 'Juil', 'Sep', 'Nov'][c]}–${['Fév', 'Avr', 'Juin', 'Août', 'Oct', 'Déc'][c]}`,
        months: keys,
        enf: b.enf,
        enfN1: bPrev?.enf ?? null,
        recouvrement: rb > 0 ? sumOver(recPaid, keys) / rb : null,
      });
    }

    /* ---------------- 2. Classement des agences (Conakry) ---------------- */
    type AgencyRow = { id: number | null; name: string; distribue: number; facture: number; factureTtc: number; recBilled: number; recPaid: number; impayes: number };
    const agencyRows = new Map<string, AgencyRow>();
    const agencyRow = (id: number | null, name: string) => {
      const key = id !== null ? `id:${id}` : `nom:${normKey(name)}`;
      const row = agencyRows.get(key) ?? { id, name, distribue: 0, facture: 0, factureTtc: 0, recBilled: 0, recPaid: 0, impayes: 0 };
      agencyRows.set(key, row);
      return row;
    };
    const inCommon = (k: string) => commonMonths.includes(k);
    for (const r of distrib) {
      const k = ym(r.exercice, r.mois);
      if (!inCommon(k)) continue;
      const id = r.agency_id !== null ? Number(r.agency_id) : null;
      agencyRow(id, id !== null ? agencyName.get(id) ?? r.agence_nom : r.agence_nom).distribue += n(r.volume_m3);
    }
    for (const r of factu) {
      const k = String(r.period_month).slice(0, 7);
      if (!inCommon(k)) continue;
      const id = Number(r.agency_id);
      const row = agencyRow(id, agencyName.get(id) ?? `Agence ${id}`);
      row.facture += n(r.volume_facture_total);
      row.factureTtc += n(r.amount_total);
    }
    for (const r of recouv) {
      const k = String(r.period_month).slice(0, 7);
      if (!recMonths.includes(k)) continue;
      const id = Number(r.agency_id);
      const row = agencyRow(id, agencyName.get(id) ?? `Agence ${id}`);
      row.recBilled += n(r.amount_penalty);
      row.recPaid += n(r.amount_paid);
      row.impayes += n(r.balance_due);
    }
    const agenciesRanking = Array.from(agencyRows.values())
      .map((a) => {
        const commercialLoss = a.distribue > 0 ? 1 - a.facture / a.distribue : null;
        const recovery = a.recBilled > 0 ? a.recPaid / a.recBilled : null;
        return {
          ...a,
          commercialLoss,
          recovery,
          lights: {
            commercialLoss: lightLow(commercialLoss, THRESHOLDS.commercialLoss),
            recovery: lightHigh(recovery, THRESHOLDS.recovery),
          },
        };
      })
      .sort((a, b) => b.facture - a.facture);

    /* ---------------- 3. Classement des centres de l'intérieur ---------------- */
    const centerMonthsTech = new Map<string, Set<number>>();
    const tech2 = new Map<string, { name: string; raw: number; treated: number; gasoil: number; byMonth: Map<number, number> }>();
    for (const r of tech) {
      const key = centerKey(r.center_name);
      if (!key) continue;
      const m = Number(String(r.period_month).slice(5, 7));
      const row = tech2.get(key) ?? { name: r.center_name, raw: 0, treated: 0, gasoil: 0, byMonth: new Map() };
      row.raw += n(r.raw_water_m3);
      row.treated += n(r.treated_water_m3);
      row.gasoil += n(r.gasoil_consumption_l);
      row.byMonth.set(m, (row.byMonth.get(m) ?? 0) + n(r.treated_water_m3));
      tech2.set(key, row);
      const set = centerMonthsTech.get(key) ?? new Set<number>();
      set.add(m);
      centerMonthsTech.set(key, set);
    }
    const factuCentres = new Map<string, { name: string; volume: number; ca: number; adm: number; byMonth: Map<number, number> }>();
    const categories = new Map<string, { ca: number; volume: number }>();
    for (const r of centresFactu) {
      const key = centerKey(r.agence_nom);
      const row = factuCentres.get(key) ?? { name: r.agence_nom, volume: 0, ca: 0, adm: 0, byMonth: new Map() };
      const ca = n(r.chiffre_affaires_ttc);
      row.volume += n(r.volume_facture);
      row.ca += ca;
      if (/adm/i.test(String(r.categorie))) row.adm += ca;
      row.byMonth.set(Number(r.mois), (row.byMonth.get(Number(r.mois)) ?? 0) + n(r.volume_facture));
      factuCentres.set(key, row);
      const cat = categories.get(String(r.categorie)) ?? { ca: 0, volume: 0 };
      cat.ca += ca;
      cat.volume += n(r.volume_facture);
      categories.set(String(r.categorie), cat);
    }
    const centersRanking = Array.from(new Set([...tech2.keys(), ...factuCentres.keys()]))
      .map((key) => {
        const t = tech2.get(key);
        const f = factuCentres.get(key);
        // ENF du centre sur les mois présents dans les deux sources.
        const months = t && f ? Array.from(t.byMonth.keys()).filter((m) => f.byMonth.has(m) && (t.byMonth.get(m) ?? 0) > 0) : [];
        const treatedCommon = t ? months.reduce((a, m) => a + (t.byMonth.get(m) ?? 0), 0) : 0;
        const billedCommon = f ? months.reduce((a, m) => a + (f.byMonth.get(m) ?? 0), 0) : 0;
        const nrw = treatedCommon > 0 ? 1 - billedCommon / treatedCommon : null;
        return {
          key,
          name: f?.name ?? t?.name ?? key,
          treated: t?.treated ?? null,
          raw: t?.raw ?? null,
          treatmentYield: t && t.raw > 0 ? t.treated / t.raw : null,
          gasoilPer1000: t && t.treated > 0 && t.gasoil > 0 ? (t.gasoil / t.treated) * 1000 : null,
          billedVolume: f?.volume ?? null,
          ca: f?.ca ?? null,
          admShare: f && f.ca > 0 ? f.adm / f.ca : null,
          commonMonths: months.length,
          nrw,
          light: nrw !== null && nrw < 0 ? ('grey' as Light) : lightLow(nrw, THRESHOLDS.centerNrw),
          dataIssue: nrw !== null && nrw < 0 ? 'Volume facturé supérieur à l’eau traitée : saisie à vérifier' : !t ? 'Pas de relevé technique' : !f ? 'Pas de facturation' : null,
        };
      })
      .sort((a, b) => (b.ca ?? 0) - (a.ca ?? 0));

    const totalCa = Array.from(categories.values()).reduce((a, c) => a + c.ca, 0);
    const categoryBreakdown = Array.from(categories.entries())
      .map(([name, c]) => ({ name, ca: c.ca, volume: c.volume, share: totalCa > 0 ? c.ca / totalCa : 0 }))
      .sort((a, b) => b.ca - a.ca);
    const admShare = categoryBreakdown.filter((c) => /adm/i.test(c.name)).reduce((a, c) => a + c.share, 0);

    const techRaw = Array.from(tech2.values()).reduce((a, t) => a + t.raw, 0);
    const techTreated = Array.from(tech2.values()).reduce((a, t) => a + t.treated, 0);

    /* ---------------- 4. Fraîcheur des données ---------------- */
    const today = new Date();
    const lastOf = (keys: string[]) => (keys.length ? keys.sort()[keys.length - 1] : null);
    const lastMonth = (m: Map<string, number>) => lastOf(Array.from(m.keys()).filter((k) => k.startsWith(String(year)) && (m.get(k) ?? 0) > 0));
    const freshnessItem = (label: string, last: string | null, source: string) => {
      // Âge = jours écoulés depuis la fin du dernier mois disponible.
      let ageDays: number | null = null;
      if (last) {
        const [y, mo] = last.split('-').map(Number);
        ageDays = Math.max(0, Math.round((today.getTime() - new Date(Date.UTC(y, mo, 0)).getTime()) / 86400000));
      }
      const status: Light = ageDays === null ? 'grey' : ageDays <= THRESHOLDS.staleDays.warn ? 'green' : ageDays <= THRESHOLDS.staleDays.bad ? 'orange' : 'red';
      return { label, last, ageDays, status, source };
    };
    const techMonths = new Map<string, number>();
    for (const r of tech) techMonths.set(String(r.period_month).slice(0, 7), 1);
    const centresMonths = new Map<string, number>();
    for (const r of centresFactu) centresMonths.set(ym(year, Number(r.mois)), 1);
    const freshness = [
      freshnessItem('Production (DPR)', lastMonth(vp), 'seg_production_sites_mensuelle'),
      freshnessItem('Distribution aux agences', lastMonth(vd), 'seg_distribution_agences_mensuelle'),
      freshnessItem('Facturation Conakry', lastMonth(billedVol), 'facturation_monthly'),
      freshnessItem('Recouvrement Conakry', lastMonth(recBilled), 'recouvrement_monthly'),
      freshnessItem('Relevés techniques centres', lastMonth(techMonths), 'seg_technique_center_monthly'),
      freshnessItem('Facturation centres', lastMonth(centresMonths), 'seg_facturation_centres_mensuelle'),
    ];

    /* ---------------- 5. Alertes automatiques ---------------- */
    type Alert = { level: 'red' | 'orange' | 'info'; title: string; detail: string };
    const alerts: Alert[] = [];
    const pct = (v: number) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
    if (waterBalance.enf !== null && waterBalance.enf > 0.4) {
      alerts.push({ level: 'red', title: `Eau non facturée à ${pct(waterBalance.enf)} (Grand Conakry)`, detail: `Sur ${commonMonths.length} mois communs : ${pct(waterBalance.pertesReseau ?? 0)} perdus avant les agences, ${pct(waterBalance.pertesCommerciales ?? 0)} distribués mais non facturés.` });
    }
    for (const a of agenciesRanking) {
      if (a.lights.commercialLoss === 'red') alerts.push({ level: 'red', title: `${a.name} : ${pct(a.commercialLoss ?? 0)} de l’eau distribuée non facturée`, detail: 'Pertes commerciales élevées (branchements non facturés, compteurs, fraude, relève).' });
      if (a.lights.recovery === 'red') alerts.push({ level: 'orange', title: `${a.name} : recouvrement à ${pct(a.recovery ?? 0)}`, detail: `Impayés : ${Math.round(a.impayes).toLocaleString('fr-FR')} GNF sur la période de recouvrement.` });
    }
    if (admShare > 0.5) {
      alerts.push({ level: 'orange', title: `L’Administration pèse ${pct(admShare)} du CA des centres de l’intérieur`, detail: 'La trésorerie dépend fortement du paiement des factures de l’État.' });
    }
    for (const c of centersRanking) {
      if (c.light === 'red') alerts.push({ level: 'orange', title: `Centre ${c.name} : ${pct(c.nrw ?? 0)} de l’eau traitée non facturée`, detail: `Sur ${c.commonMonths} mois communs aux relevés et à la facturation.` });
      if (c.nrw !== null && c.nrw < 0) alerts.push({ level: 'info', title: `Centre ${c.name} : facturé > eau traitée`, detail: 'Incohérence entre relevés techniques et facturation, à vérifier.' });
    }
    // Incidents de terrain encore ouverts (registre seg_evenements_terrain)
    {
      const { data: openEvents } = await supabaseAdmin
        .from('seg_evenements_terrain')
        .select('nature,gravite')
        .in('statut', ['ouvert', 'en_cours']);
      const incidents = ((openEvents ?? []) as Array<{ nature: string; gravite: string | null }>).filter((e) => e.nature === 'incident');
      const critical = incidents.filter((e) => e.gravite === 'critique').length;
      if (incidents.length > 0) {
        alerts.push({
          level: critical > 0 ? 'red' : 'orange',
          title: `${incidents.length} incident(s) de terrain non résolu(s)${critical > 0 ? `, dont ${critical} critique(s)` : ''}`,
          detail: 'Registre des incidents : voir la page Incidents & Signalements.',
        });
      }
    }
    for (const f of freshness) {
      if (f.status === 'red' || f.status === 'orange') alerts.push({ level: f.status === 'red' ? 'red' : 'orange', title: `${f.label} : dernières données ${f.last ?? 'absentes'}`, detail: f.ageDays !== null ? `Données vieilles de ${f.ageDays} jours.` : 'Aucune donnée pour cet exercice.' });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          year,
          thresholds: THRESHOLDS,
          waterBalance,
          waterBalanceN1,
          money,
          cycles,
          agencies: agenciesRanking,
          centers: centersRanking,
          categories: categoryBreakdown,
          admShare,
          interiorTreatment: { raw: techRaw, treated: techTreated, yield: techRaw > 0 ? techTreated / techRaw : null },
          freshness,
          alerts,
          generatedAt: new Date().toISOString(),
        },
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    console.error('[tableau-technique]', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'Erreur interne lors du calcul du tableau de bord technique.' }, { status: 500 });
  }
}
