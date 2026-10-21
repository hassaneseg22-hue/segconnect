import { supabaseAdmin } from '@/lib/supabase/admin';

export type OverviewFilters = {
  year: number;
  from?: string;
  to?: string;
  agency?: string;
  clientType?: string;
};

const money = (v: unknown) => Number(v || 0);

function inDateRange(
  value: string | null | undefined,
  start: string,
  end: string
) {
  if (!value) return false;
  return value >= start && value <= end;
}

export async function getOverview(filters: OverviewFilters) {
  const start = filters.from || `${filters.year}-01-01`;
  const end = filters.to || `${filters.year}-12-31`;

  /*
   * ============================================================
   * 1. RÉFÉRENTIELS
   * ============================================================
   */

  const [
    { data: agencies, error: agenciesError },
    { data: clientTypes, error: clientTypesError },
  ] = await Promise.all([
    supabaseAdmin
      .from('agencies')
      .select('id, name'),

    supabaseAdmin
      .from('client_types')
      .select('id, name'),
  ]);

  if (agenciesError) throw agenciesError;
  if (clientTypesError) throw clientTypesError;

  const agencyById = new Map(
    (agencies ?? []).map((a) => [Number(a.id), a.name])
  );

  const clientTypeById = new Map(
    (clientTypes ?? []).map((c) => [Number(c.id), c.name])
  );

  /*
   * ============================================================
   * 2. FACTURATION
   * ============================================================
   */

  let facturationQuery = supabaseAdmin
    .from('facturation_monthly')
    .select(`
      period_month,
      agency_id,
      client_type_id,
      subscribers_total,
      volume_consume_total,
      volume_facture_total,
      amount_total,
      amount_penalty,
      amount_paid,
      balance_due
    `)
    .gte('period_month', start)
    .lte('period_month', end);

  const { data: facturation, error: facturationError } =
    await facturationQuery;

  if (facturationError) throw facturationError;

  const facturationRows = (facturation ?? []).filter((row) => {
    const agencyName = agencyById.get(Number(row.agency_id));
    const clientTypeName = clientTypeById.get(Number(row.client_type_id));

    if (filters.agency && agencyName !== filters.agency) {
      return false;
    }

    if (filters.clientType && clientTypeName !== filters.clientType) {
      return false;
    }

    return inDateRange(row.period_month, start, end);
  });

  /*
   * ============================================================
   * 3. RECOUVREMENT
   * ============================================================
   */

  const { data: recouvrement, error: recouvrementError } =
    await supabaseAdmin
      .from('recouvrement_monthly')
      .select(`
        period_month,
        agency_id,
        client_type_id,
        amount_penalty,
        amount_paid,
        balance_due,
        amount_paid_updated,
        balance_due_updated
      `)
      .gte('period_month', start)
      .lte('period_month', end);

  if (recouvrementError) throw recouvrementError;

  const recouvrementRows = (recouvrement ?? []).filter((row) => {
    const agencyName = agencyById.get(Number(row.agency_id));
    const clientTypeName = clientTypeById.get(Number(row.client_type_id));

    if (filters.agency && agencyName !== filters.agency) {
      return false;
    }

    if (filters.clientType && clientTypeName !== filters.clientType) {
      return false;
    }

    return inDateRange(row.period_month, start, end);
  });

  /*
   * ============================================================
   * 4. TECHNIQUE
   * ============================================================
   */

  const { data: technique, error: techniqueError } =
    await supabaseAdmin
      .from('technique_monthly')
      .select(`
        period_month,
        agency_id,
        volume_produced,
        volume_consumed,
        volume_billed
      `)
      .gte('period_month', start)
      .lte('period_month', end);

  if (techniqueError) throw techniqueError;

  const techniqueRows = (technique ?? []).filter((row) => {
    const agencyName = agencyById.get(Number(row.agency_id));

    if (filters.agency && agencyName !== filters.agency) {
      return false;
    }

    return inDateRange(row.period_month, start, end);
  });

  /*
   * ============================================================
   * 5. AGRÉGATION FACTURATION
   * ============================================================
   */

  const fac = facturationRows.reduce(
    (acc, row) => {
      acc.subscribers += money(row.subscribers_total);
      acc.volumeConsumed += money(row.volume_consume_total);
      acc.volumeBilled += money(row.volume_facture_total);
      acc.revenue += money(row.amount_total);
      acc.penalties += money(row.amount_penalty);
      acc.paid += money(row.amount_paid);
      acc.balanceDue += money(row.balance_due);

      return acc;
    },
    {
      subscribers: 0,
      volumeConsumed: 0,
      volumeBilled: 0,
      revenue: 0,
      penalties: 0,
      paid: 0,
      balanceDue: 0,
    }
  );

  /*
   * ============================================================
   * 6. AGRÉGATION RECOUVREMENT
   * ============================================================
   */

  const rec = recouvrementRows.reduce(
    (acc, row) => {
      acc.billedWithPenalty += money(row.amount_penalty);
      acc.paid += money(row.amount_paid);
      acc.balanceDue += money(row.balance_due);
      acc.paidUpdated += money(row.amount_paid_updated);
      acc.balanceDueUpdated += money(row.balance_due_updated);

      return acc;
    },
    {
      billedWithPenalty: 0,
      paid: 0,
      balanceDue: 0,
      paidUpdated: 0,
      balanceDueUpdated: 0,
    }
  );

  /*
   * ============================================================
   * 7. AGRÉGATION TECHNIQUE
   * ============================================================
   */

  const tech = techniqueRows.reduce(
    (acc, row) => {
      acc.volumeProduced += money(row.volume_produced);
      acc.volumeConsumed += money(row.volume_consumed);
      acc.volumeBilled += money(row.volume_billed);

      return acc;
    },
    {
      volumeProduced: 0,
      volumeConsumed: 0,
      volumeBilled: 0,
    }
  );

  /*
   * ============================================================
   * 8. SÉRIE MENSUELLE
   * ============================================================
   */

  const monthlyMap = new Map<
    string,
    {
      production: number;
      consumption: number;
      billing_volume: number;
    }
  >();

  for (const row of techniqueRows) {
    const month = String(row.period_month).slice(0, 7);

    const current = monthlyMap.get(month) ?? {
      production: 0,
      consumption: 0,
      billing_volume: 0,
    };

    current.production += money(row.volume_produced);
    current.consumption += money(row.volume_consumed);
    current.billing_volume += money(row.volume_billed);

    monthlyMap.set(month, current);
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      ...values,
    }));

  /*
   * ============================================================
   * 9. PERFORMANCE PAR AGENCE
   * ============================================================
   */

  type AgencyOverview = {
    name: string;
    revenue: number;
    volumeBilled: number;
    volumeConsumed: number;
    subscribers: number;
    balance: number;
    recBilled: number;
    recPaid: number;
    production: number;
    technicalConsumption: number;
    technicalBilling: number;
    recovery?: number;
    networkYield?: number;
    billingRatio?: number;
    impayes?: number;
    impayesEmissions?: number;
    impayesRate?: number;
    impayesRows?: number;
  };

  const agencyMap = new Map<number, AgencyOverview>();

  for (const row of facturationRows) {
    const agencyId = Number(row.agency_id);
    const name = agencyById.get(agencyId) || `Agence ${agencyId}`;

    const current = agencyMap.get(agencyId) ?? {
      name,
      revenue: 0,
      volumeBilled: 0,
      volumeConsumed: 0,
      subscribers: 0,
      balance: 0,
      recBilled: 0,
      recPaid: 0,
      production: 0,
      technicalConsumption: 0,
      technicalBilling: 0,
    };

    current.revenue += money(row.amount_total);
    current.volumeBilled += money(row.volume_facture_total);
    current.volumeConsumed += money(row.volume_consume_total);
    current.subscribers += money(row.subscribers_total);
    current.balance += money(row.balance_due);

    agencyMap.set(agencyId, current);
  }

  for (const row of recouvrementRows) {
    const agencyId = Number(row.agency_id);
    const name = agencyById.get(agencyId) || `Agence ${agencyId}`;

    const current = agencyMap.get(agencyId) ?? {
      name,
      revenue: 0,
      volumeBilled: 0,
      volumeConsumed: 0,
      subscribers: 0,
      balance: 0,
      recBilled: 0,
      recPaid: 0,
      production: 0,
      technicalConsumption: 0,
      technicalBilling: 0,
    };

    current.recBilled += money(row.amount_penalty);
    current.recPaid += money(row.amount_paid);
    current.balance += money(row.balance_due);

    agencyMap.set(agencyId, current);
  }

  for (const row of techniqueRows) {
    const agencyId = Number(row.agency_id);
    const name = agencyById.get(agencyId) || `Agence ${agencyId}`;

    const current = agencyMap.get(agencyId) ?? {
      name,
      revenue: 0,
      volumeBilled: 0,
      volumeConsumed: 0,
      subscribers: 0,
      balance: 0,
      recBilled: 0,
      recPaid: 0,
      production: 0,
      technicalConsumption: 0,
      technicalBilling: 0,
    };

    current.production += money(row.volume_produced);
    current.technicalConsumption += money(row.volume_consumed);
    current.technicalBilling += money(row.volume_billed);

    agencyMap.set(agencyId, current);
  }

  
  /*
   * ============================================================
   * SEG_ALL_11_AGENCIES_OVERVIEW_V1
   * ============================================================
   *
   * Le référentiel public.agencies est la source de vérité
   * pour le nombre et l'existence des agences.
   *
   * Il contient actuellement 11 agences :
   * Yimbaya, Matoto, Kountia, Wanindara, Cimenterie,
   * Ratoma, Dixinn, Kaloum, Matam, Coyah et Dubreka.
   *
   * Une agence doit apparaître dans overview.agencies même
   * lorsqu'elle ne possède pas encore de lignes dans les
   * anciennes tables facturation/recouvrement/technique.
   */

  /*
   * Ajouter toutes les agences du référentiel dans agencyMap.
   * On conserve les données déjà calculées lorsqu'elles existent.
   */

  for (const agency of agencies ?? []) {
    const agencyName = String(agency.name || '').trim();

    if (!agencyName) {
      continue;
    }

    if (
      filters.agency &&
      agencyName !== filters.agency
    ) {
      continue;
    }

    const key = Number(agency.id);

    if (!Number.isFinite(key)) {
      continue;
    }

    if (!agencyMap.has(key)) {
      agencyMap.set(key, {
        name: agencyName,
        revenue: 0,
        volumeBilled: 0,
        volumeConsumed: 0,
        subscribers: 0,
        balance: 0,
        recBilled: 0,
        recPaid: 0,
        recovery: 0,
        production: 0,
        technicalConsumption: 0,
        technicalBilling: 0,
        networkYield: 0,
        billingRatio: 0,
        impayes: 0,
        impayesEmissions: 0,
        impayesRate: 0,
        impayesRows: 0,
      });
    }
  }

  /*
   * ============================================================
   * IMPAYÉS OFFICIELS SEG
   * ============================================================
   *
   * Source :
   * public.seg_impayes_zone
   *
   * On utilise cette source pour alimenter le montant des
   * impayés par agence dans toutes les pages qui consomment
   * overview.agencies.
   */

  let officialImpayesRows: Array<{
    agency_id: number;
    emissions: number | null;
    impayes: number | null;
  }> = [];

  if (!filters.clientType) {
    const {
      data: rows,
      error: impayesError,
    } = await supabaseAdmin
      .from('seg_impayes_zone')
      .select(`
        agency_id,
        emissions,
        impayes
      `)
      .eq('exercise', filters.year);

    if (impayesError) {
      throw impayesError;
    }

    officialImpayesRows = rows ?? [];
  }

  const officialImpayesByAgency = new Map<
    number,
    {
      emissions: number;
      impayes: number;
      rows: number;
    }
  >();

  for (const row of officialImpayesRows) {
    const agencyId = Number(row.agency_id);

    if (!Number.isFinite(agencyId)) {
      continue;
    }

    if (filters.agency) {
      const agencyRef = (agencies ?? []).find(
        (agency) =>
          Number(agency.id) === agencyId
      );

      if (
        !agencyRef ||
        agencyRef.name !== filters.agency
      ) {
        continue;
      }
    }

    const current =
      officialImpayesByAgency.get(agencyId) || {
        emissions: 0,
        impayes: 0,
        rows: 0,
      };

    current.emissions +=
      Number(row.emissions) || 0;

    current.impayes +=
      Number(row.impayes) || 0;

    current.rows += 1;

    officialImpayesByAgency.set(
      agencyId,
      current
    );
  }

  /*
   * Fusionner les impayés officiels dans agencyMap.
   *
   * IMPORTANT :
   * on utilise agency_id pour la correspondance,
   * jamais agency_name comme mécanisme de sécurité.
   */

  for (const agency of agencies ?? []) {
    const agencyId = Number(agency.id);
    const agencyName = String(agency.name || '').trim();

    if (!agencyName) {
      continue;
    }

    if (
      filters.agency &&
      agencyName !== filters.agency
    ) {
      continue;
    }

    const official =
      officialImpayesByAgency.get(agencyId);

    const key = Number(agency.id);

    if (!Number.isFinite(key)) {
      continue;
    }

    const existing: AgencyOverview =
      agencyMap.get(key) || {
        name: agencyName,
        revenue: 0,
        volumeBilled: 0,
        volumeConsumed: 0,
        subscribers: 0,
        balance: 0,
        recBilled: 0,
        recPaid: 0,
        production: 0,
        technicalConsumption: 0,
        technicalBilling: 0,
        recovery: 0,
        networkYield: 0,
        billingRatio: 0,
        impayes: 0,
        impayesEmissions: 0,
        impayesRate: 0,
        impayesRows: 0,
      };

    if (official) {
      existing.balance =
        official.impayes;

      existing.impayes =
        official.impayes;

      existing.impayesEmissions =
        official.emissions;

      existing.impayesRate =
        official.emissions > 0
          ? official.impayes /
            official.emissions
          : 0;

      existing.impayesRows =
        official.rows;
    } else {
      /*
       * Pas de données d'impayés pour cette agence :
       * aucune valeur fictive n'est créée.
       */

      existing.impayes =
        Number(existing.impayes ?? existing.balance) || 0;

      existing.impayesEmissions =
        Number(existing.impayesEmissions) || 0;

      existing.impayesRate =
        Number(existing.impayesRate) || 0;

      existing.impayesRows =
        Number(existing.impayesRows) || 0;
    }

    agencyMap.set(key, existing);
  }

const agenciesResult = Array.from(agencyMap.values()).sort(
    (a, b) =>
      String(a.name).localeCompare(
        String(b.name),
        'fr',
        { sensitivity: 'base' }
      )
  )
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => ({
      name: r.name,
      revenue: r.revenue,
      volumeBilled: r.volumeBilled,
      volumeConsumed: r.volumeConsumed,
      subscribers: r.subscribers,
      balance: r.balance,
      impayes: r.impayes ?? 0,
      impayesEmissions: r.impayesEmissions ?? 0,
      impayesRate: r.impayesRate ?? 0,
      impayesRows: r.impayesRows ?? 0,
      recovery:
        r.recBilled > 0
          ? r.recPaid / r.recBilled
          : 0,
      production: r.production,
      technicalConsumption: r.technicalConsumption,
      networkYield:
        r.production > 0
          ? r.technicalConsumption / r.production
          : 0,
      billingRatio:
        r.production > 0
          ? r.technicalBilling / r.production
          : 0,
    }));

  /*
   * ============================================================
   * 10. SÉRIE MENSUELLE PAR AGENCE
   * ============================================================
   */

  const agencyMonthlyMap = new Map<
    string,
    {
      name: string;
      month: string;
      production: number;
      consumption: number;
      billing_volume: number;
    }
  >();

  for (const row of techniqueRows) {
    const agencyId = Number(row.agency_id);
    const name = agencyById.get(agencyId) || `Agence ${agencyId}`;
    const month = String(row.period_month).slice(0, 7);
    const key = `${agencyId}-${month}`;

    const current = agencyMonthlyMap.get(key) ?? {
      name,
      month,
      production: 0,
      consumption: 0,
      billing_volume: 0,
    };

    current.production += money(row.volume_produced);
    current.consumption += money(row.volume_consumed);
    current.billing_volume += money(row.volume_billed);

    agencyMonthlyMap.set(key, current);
  }

  const agencyMonthly = Array.from(agencyMonthlyMap.values()).sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      a.month.localeCompare(b.month)
  );

  /*
   * ============================================================
   * 11. QUALITÉ DES DONNÉES
   * ============================================================
   */

  const { data: qualityIssuesRows, error: qualityError } =
    await supabaseAdmin
      .from('data_quality_issues')
      .select(`
        id,
        severity,
        category,
        message,
        sheet_name,
        excel_row,
        resolved
      `)
      .eq('resolved', false)
      .order('id', { ascending: false })
      .limit(10);

  if (qualityError) throw qualityError;

  const qualityIssues = (qualityIssuesRows ?? []).map((q) => ({
    id: Number(q.id),
    severity: q.severity,
    category: q.category,
    message: q.message,
    sheet_name: q.sheet_name,
    excel_row: q.excel_row,
  }));

  const quality = (qualityIssuesRows ?? []).reduce(
    (acc: Record<string, number>, row) => {
      acc[row.severity] = (acc[row.severity] || 0) + 1;
      return acc;
    },
    {}
  );

  /*
   * ============================================================
   * 12. COMPARAISON N / N-1
   * ============================================================
   */

  const lastCurr =
    monthly.length > 0
      ? monthly[monthly.length - 1].month
      : null;

  const previousYear = filters.year - 1;

  const previousEndMonth = lastCurr
    ? lastCurr.slice(5, 7)
    : '12';

  const previousStart = `${previousYear}-01-01`;
  const previousEnd = `${previousYear}-${previousEndMonth}-01`;

  const { data: previousTechnique, error: previousError } =
    await supabaseAdmin
      .from('technique_monthly')
      .select(`
        period_month,
        agency_id,
        volume_produced,
        volume_consumed,
        volume_billed
      `)
      .gte('period_month', previousStart)
      .lte('period_month', previousEnd);

  if (previousError) throw previousError;

  const previousRows = (previousTechnique ?? []).filter((row) => {
    if (!filters.agency) return true;

    const agencyName = agencyById.get(Number(row.agency_id));

    return agencyName === filters.agency;
  });

  const compare = previousRows.reduce(
    (acc, row) => {
      acc.production += money(row.volume_produced);
      acc.consumption += money(row.volume_consumed);
      acc.billing += money(row.volume_billed);

      return acc;
    },
    {
      production: 0,
      consumption: 0,
      billing: 0,
    }
  );

  /*
   * ============================================================
   * 13. KPI FINAUX
   * ============================================================
   */

  const billedWithPenalty =
    rec.billedWithPenalty ||
    fac.revenue + fac.penalties;

  const paid =
    rec.paid ||
    fac.paid;

  const balance =
    rec.balanceDue ||
    Math.max(0, billedWithPenalty - paid);

  const recovery =
    billedWithPenalty > 0
      ? paid / billedWithPenalty
      : 0;

  const recoveryUpdated =
    rec.paidUpdated + rec.balanceDueUpdated > 0
      ? rec.paidUpdated /
        (rec.paidUpdated + rec.balanceDueUpdated)
      : null;

  /*
   * ============================================================
   * 14. FORMAT DE SORTIE IDENTIQUE À L'ANCIEN DASHBOARD
   * ============================================================
   */

  return {
    filters: {
      year: filters.year,
      from: start,
      to: end,
      agency: filters.agency || 'Toutes',
      clientType: filters.clientType || 'Tous',
    },

    kpis: {
      subscribers: fac.subscribers,
      volumeConsumed: fac.volumeConsumed,
      volumeBilled: fac.volumeBilled,
      revenue: fac.revenue,
      paid,
      balance,
      billedWithPenalty,
      recovery,
      recoveryUpdated,

      production: tech.volumeProduced,
      technicalConsumption: tech.volumeConsumed,
      technicalBilling: tech.volumeBilled,

      networkYield:
        tech.volumeProduced > 0
          ? tech.volumeConsumed / tech.volumeProduced
          : 0,

      billingRatio:
        tech.volumeProduced > 0
          ? tech.volumeBilled / tech.volumeProduced
          : 0,
    },

    compare,

    distribution: tech.volumeConsumed,

    losses: Math.max(
      0,
      tech.volumeProduced - tech.volumeConsumed
    ),

    monthly,

    agencies: agenciesResult,

    agencyMonthly,

    qualityIssues,

    quality,
  };
}
