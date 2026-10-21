import { getPool } from '@/lib/mysql';

export type OverviewFilters = {
  year: number;
  from?: string;
  to?: string;
  agency?: string;
  clientType?: string;
};

const money = (v: unknown) => Number(v || 0);

export async function getOverview(filters: OverviewFilters) {
  const db = getPool();
  const start = filters.from || `${filters.year}-01-01`;
  const end = filters.to || `${filters.year}-12-31`;
  const params: unknown[] = [start, end];
  const agencyClause = filters.agency ? ' AND a.name = ?' : '';
  if (filters.agency) params.push(filters.agency);
  const clientClause = filters.clientType ? ' AND ct.name = ?' : '';
  if (filters.clientType) params.push(filters.clientType);

  const [facRows] = await db.query<any[]>(`
    SELECT
      COALESCE(SUM(f.subscribers_total),0) subscribers,
      COALESCE(SUM(f.volume_consume_total),0) volume_consumed,
      COALESCE(SUM(f.volume_facture_total),0) volume_billed,
      COALESCE(SUM(f.amount_total),0) revenue,
      COALESCE(SUM(f.amount_penalty),0) penalties,
      COALESCE(SUM(f.amount_paid),0) paid,
      COALESCE(SUM(f.balance_due),0) balance_due
    FROM facturation_monthly f
    JOIN agencies a ON a.id=f.agency_id
    JOIN client_types ct ON ct.id=f.client_type_id
    WHERE f.period_month BETWEEN ? AND ? ${agencyClause}${clientClause}
  `, params);

  const recParams: unknown[] = [start, end];
  if (filters.agency) recParams.push(filters.agency);
  if (filters.clientType) recParams.push(filters.clientType);
  const [recRows] = await db.query<any[]>(`
    SELECT
      COALESCE(SUM(r.amount_penalty),0) billed_with_penalty,
      COALESCE(SUM(r.amount_paid),0) paid,
      COALESCE(SUM(r.balance_due),0) balance_due,
      COALESCE(SUM(r.amount_paid_updated),0) paid_updated,
      COALESCE(SUM(r.balance_due_updated),0) balance_due_updated
    FROM recouvrement_monthly r
    JOIN agencies a ON a.id=r.agency_id
    JOIN client_types ct ON ct.id=r.client_type_id
    WHERE r.period_month BETWEEN ? AND ? ${agencyClause}${clientClause}
  `, recParams);

  const techParams: unknown[] = [start, end];
  if (filters.agency) techParams.push(filters.agency);
  const [techRows] = await db.query<any[]>(`
    SELECT
      COALESCE(SUM(t.volume_produced),0) volume_produced,
      COALESCE(SUM(t.volume_consumed),0) volume_consumed,
      COALESCE(SUM(t.volume_billed),0) volume_billed
    FROM technique_monthly t
    JOIN agencies a ON a.id=t.agency_id
    WHERE t.period_month BETWEEN ? AND ? ${agencyClause}
  `, techParams);

  const [monthly] = await db.query<any[]>(`
    SELECT DATE_FORMAT(t.period_month,'%Y-%m') month,
      COALESCE(SUM(t.volume_produced),0) production,
      COALESCE(SUM(t.volume_consumed),0) consumption,
      COALESCE(SUM(t.volume_billed),0) billing_volume
    FROM technique_monthly t
    JOIN agencies a ON a.id=t.agency_id
    WHERE t.period_month BETWEEN ? AND ? ${agencyClause}
    GROUP BY t.period_month ORDER BY t.period_month
  `, techParams);

  const agParams: unknown[] = [start, end];
  if (filters.agency) agParams.push(filters.agency);
  const [agencyRows] = await db.query<any[]>(`
    SELECT a.name,
      COALESCE(SUM(f.amount_total),0) revenue,
      COALESCE(SUM(f.volume_facture_total),0) volume_billed,
      COALESCE(SUM(f.subscribers_total),0) subscribers,
      COALESCE(SUM(f.volume_consume_total),0) volume_consumed_com,
      COALESCE(SUM(r.amount_penalty),0) rec_billed,
      COALESCE(SUM(r.amount_paid),0) rec_paid,
      COALESCE(SUM(r.balance_due),0) rec_balance,
      COALESCE(SUM(t.volume_produced),0) vol_produced,
      COALESCE(SUM(t.volume_consumed),0) vol_consumed,
      COALESCE(SUM(t.volume_billed),0) vol_billed_tech
    FROM facturation_monthly f
    JOIN agencies a ON a.id=f.agency_id
    JOIN client_types ct ON ct.id=f.client_type_id
    LEFT JOIN recouvrement_monthly r ON r.period_month=f.period_month AND r.agency_id=f.agency_id AND r.client_type_id=f.client_type_id
    LEFT JOIN technique_monthly t ON t.period_month=f.period_month AND t.agency_id=f.agency_id
    WHERE f.period_month BETWEEN ? AND ? ${agencyClause}${clientClause}
    GROUP BY a.id,a.name ORDER BY revenue DESC
  `, params);

  // Série mensuelle par agence (production / consommation / facturation) — technique_monthly n'a pas de client_type
  const [agencyMonthlyRows] = await db.query<any[]>(`
    SELECT a.name,
      DATE_FORMAT(t.period_month,'%Y-%m') month,
      COALESCE(SUM(t.volume_produced),0) production,
      COALESCE(SUM(t.volume_consumed),0) consumption,
      COALESCE(SUM(t.volume_billed),0) billing_volume
    FROM technique_monthly t
    JOIN agencies a ON a.id=t.agency_id
    WHERE t.period_month BETWEEN ? AND ? ${agencyClause}
    GROUP BY a.id, a.name, t.period_month ORDER BY a.name, t.period_month
  `, agParams);

  const [qualityRows] = await db.query<any[]>(`
    SELECT severity, COUNT(*) count
    FROM data_quality_issues q
    WHERE q.resolved=0
    GROUP BY severity
  `);

  const [qualityIssues] = await db.query<any[]>(`
    SELECT id, severity, category, message, sheet_name, excel_row
    FROM data_quality_issues q
    WHERE q.resolved=0
    ORDER BY FIELD(severity,'critical','warning','info'), q.id DESC
    LIMIT 10
  `);

  // --- Comparaison N / N-1 (mêmes périmètres temporels décalés d'un an) ---
  // Seule la production / consommation / facturation technique est comparable :
  // technique_monthly n'a pas de dimension client_type, on applique uniquement l'agence.
  // On compare année par année en gardant la même fenêtre de mois que l'année courante,
  // puis on tronque à dernière donnée disponible (périodes comparables uniquement).
  const lastCurr = (monthly[monthly.length - 1] as any)?.month;
  const _y = Number(filters.year) - 1;
  const _m = lastCurr ? String(Number(lastCurr.slice(5, 7))).padStart(2, '0') : '12';
  const prevParams: unknown[] = [`${_y}-01-01`, `${_y}-${_m}-01`];
  if (filters.agency) prevParams.push(filters.agency);
  const [prevRows] = await db.query<any[]>(`
    SELECT
      COALESCE(SUM(volume_produced),0) production,
      COALESCE(SUM(volume_consumed),0) consumption,
      COALESCE(SUM(volume_billed),0) billing_volume
    FROM technique_monthly t
    JOIN agencies a ON a.id=t.agency_id
    WHERE t.period_month BETWEEN ? AND ? ${filters.agency ? ' AND a.name = ?' : ''}
  `, prevParams);
  const prevT = prevRows[0] || {};
  const compare = {
    production: Number(prevT.production) || 0,
    consumption: Number(prevT.consumption) || 0,
    billing: Number(prevT.billing_volume) || 0,
  };

  const fac = facRows[0] || {};
  const rec = recRows[0] || {};
  const tech = techRows[0] || {};
  const billedWithPenalty = money(rec.billed_with_penalty) || money(fac.revenue) + money(fac.penalties);
  const paid = money(rec.paid) || money(fac.paid);
  const balance = money(rec.balance_due) || Math.max(0, billedWithPenalty - paid);
  const recovery = billedWithPenalty > 0 ? paid / billedWithPenalty : 0;
  const recoveryUpdated = money(rec.paid_updated) + money(rec.balance_due_updated) > 0
    ? money(rec.paid_updated) / (money(rec.paid_updated) + money(rec.balance_due_updated))
    : null;

  return {
    filters: { year: filters.year, from: start, to: end, agency: filters.agency || 'Toutes', clientType: filters.clientType || 'Tous' },
    kpis: {
      subscribers: money(fac.subscribers),
      volumeConsumed: money(fac.volume_consumed),
      volumeBilled: money(fac.volume_billed),
      revenue: money(fac.revenue),
      paid,
      balance,
      billedWithPenalty,
      recovery,
      recoveryUpdated,
      production: money(tech.volume_produced),
      technicalConsumption: money(tech.volume_consumed),
      technicalBilling: money(tech.volume_billed),
      networkYield: money(tech.volume_produced) > 0 ? money(tech.volume_consumed) / money(tech.volume_produced) : 0,
      billingRatio: money(tech.volume_produced) > 0 ? money(tech.volume_billed) / money(tech.volume_produced) : 0
    },
    compare,
    distribution: money(tech.volume_consumed),
    losses: Math.max(0, money(tech.volume_produced) - money(tech.volume_consumed)),
    monthly: monthly.map((r: any) => ({ month: r.month, production: money(r.production), consumption: money(r.consumption), billing_volume: money(r.billing_volume) })),
    agencies: agencyRows.map((r: any) => {
      const billed = money(r.rec_billed);
      const paidAgency = money(r.rec_paid);
      const produced = money(r.vol_produced);
      return { name: r.name, revenue: money(r.revenue), volumeBilled: money(r.volume_billed), volumeConsumed: money(r.volume_consumed_com), subscribers: money(r.subscribers), balance: money(r.rec_balance), recovery: billed > 0 ? paidAgency / billed : 0, production: produced, technicalConsumption: money(r.vol_consumed), networkYield: produced > 0 ? money(r.vol_consumed) / produced : 0, billingRatio: produced > 0 ? money(r.vol_billed_tech) / produced : 0 };
    }),
    agencyMonthly: agencyMonthlyRows.map((r: any) => ({ name: r.name, month: r.month, production: money(r.production), consumption: money(r.consumption), billing_volume: money(r.billing_volume) })),
    qualityIssues: qualityIssues.map((q:any) => ({ id: Number(q.id), severity: q.severity, category: q.category, message: q.message, sheet_name: q.sheet_name, excel_row: q.excel_row })),
    quality: qualityRows.reduce((acc: Record<string, number>, r: any) => { acc[r.severity] = Number(r.count); return acc; }, {})
  };
}
